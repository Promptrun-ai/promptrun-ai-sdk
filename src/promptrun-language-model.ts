import {
  LanguageModelV1,
  LanguageModelV1CallOptions,
  LanguageModelV1FinishReason,
  LanguageModelV1Prompt,
} from "@ai-sdk/provider";
import { createPromptrunStream } from "./stream-utils";
import {
  PromptrunAPIError,
  PromptrunAuthenticationError,
  PromptrunConnectionError,
  PromptrunLanguageModelOptions,
  PromptrunSDKOptions,
} from "./types";

/**
 * Converts AI SDK message format to OpenAI-compatible API format.
 * The AI SDK uses content as an array of content parts, but the API expects a string.
 * @param {LanguageModelV1Prompt} messages The messages from the AI SDK.
 * @returns {Array<{role: string, content: string}>} Messages in API-compatible format.
 */
function transformMessagesForAPI(
  messages: LanguageModelV1Prompt
): Array<{ role: string; content: string }> {
  return messages.map((message) => {
    let content = "";

    if (Array.isArray(message.content)) {
      // Extract text from content parts
      content = message.content
        .filter((part) => part.type === "text")
        .map((part) => (part as { text: string }).text)
        .join("");
    } else if (typeof message.content === "string") {
      content = message.content;
    }

    return {
      role: message.role,
      content,
    };
  });
}

/**
 * A workaround to treat a `ReadableStream` as an `AsyncIterable`.
 * This is necessary in environments where TypeScript's `lib` configuration
 * for "DOM.AsyncIterable" is not correctly picked up.
 * @template T The type of data in the stream.
 * @param {ReadableStream<T>} stream The stream to convert.
 * @returns {AsyncIterable<T>} An async iterable that can be used with for...await...of.
 */
export function asAsyncIterable<T>(
  stream: ReadableStream<T>
): AsyncIterable<T> {
  const reader = stream.getReader();
  return {
    [Symbol.asyncIterator]() {
      return {
        async next() {
          const { done, value } = await reader.read();
          return done
            ? { done: true, value: undefined }
            : { done: false, value };
        },
        async return() {
          reader.releaseLock();
          return { done: true, value: undefined };
        },
      };
    },
  };
}

/**
 * A workaround to convert a `Headers` object into a key-value record.
 * This is necessary in environments where modern iterator methods are not
 * found on the `Headers` type due to an incomplete `lib` configuration.
 * @param {Headers} headers The `Headers` object from a fetch response.
 * @returns {Record<string, string>} A plain object representing the headers.
 */
function headersToRecord(headers: Headers): Record<string, string> {
  const record: Record<string, string> = {};
  headers.forEach((value, key) => {
    record[key] = value;
  });
  return record;
}

/**
 * The core language model implementation for the PromptRun provider.
 * This class adapts the PromptRun API to the `LanguageModelV1` interface.
 * @implements {LanguageModelV1}
 */
export class PromptrunLanguageModel implements LanguageModelV1 {
  readonly modelId: string;
  private readonly sdkOptions: PromptrunSDKOptions;
  private readonly modelOptions?: PromptrunLanguageModelOptions;

  readonly specificationVersion = "v1" as const;
  readonly supportedUrls = {};
  readonly defaultObjectGenerationMode = undefined;

  constructor(
    modelId: string,
    sdkOptions: PromptrunSDKOptions,
    modelOptions?: PromptrunLanguageModelOptions
  ) {
    this.modelId = modelId;
    this.sdkOptions = sdkOptions;
    this.modelOptions = modelOptions;
  }

  get provider(): string {
    return "promptrun";
  }

  async doStream(options: LanguageModelV1CallOptions) {
    const { stream, response, rawCall, request } =
      await this.executeStreamRequest(options);

    return {
      stream,
      rawCall,
      rawResponse: {
        headers: response.headers,
      },
      request,
      warnings: [],
    };
  }

  async doGenerate(options: LanguageModelV1CallOptions) {
    const { stream, response, rawCall, request } =
      await this.executeStreamRequest(options);

    let text = "";
    let finishReason: LanguageModelV1FinishReason = "other";
    let usage = {
      promptTokens: 0,
      completionTokens: 0,
    };

    for await (const part of asAsyncIterable(stream)) {
      if (part.type === "text-delta") {
        text += part.textDelta;
      } else if (part.type === "finish") {
        finishReason = part.finishReason;
        usage = {
          promptTokens: part.usage.promptTokens,
          completionTokens: part.usage.completionTokens,
        };
      }
    }

    return {
      text,
      finishReason,
      usage,
      rawCall,
      rawResponse: {
        headers: response.headers,
      },
      request,
      response: {
        timestamp: new Date(),
        modelId: this.modelId,
      },
      warnings: [],
    };
  }

  /**
   * Centralizes the logic for making API calls. It now supports prompt caching
   * by reading custom `X-PromptRun-*` headers from the options and throws
   * specific errors on failure.
   * @private
   */
  private async executeStreamRequest(options: LanguageModelV1CallOptions) {
    const baseUrl = this.sdkOptions.baseURL ?? "https://api.promptrun.ai/v1";
    const url = `${baseUrl}/chat/completions`;
    const prompt: LanguageModelV1Prompt = options.prompt;

    const headers = { ...options.headers };

    const promptId =
      headers["x-promptrun-cache-id"] ?? this.modelOptions?.cache?.id;
    const useCachedPrompt = headers["x-promptrun-use-cache"] === "true";

    if (headers["x-promptrun-cache-id"]) {
      delete headers["x-promptrun-cache-id"];
    }
    if (headers["x-promptrun-use-cache"]) {
      delete headers["x-promptrun-use-cache"];
    }

    const requestBody: {
      model: string;
      messages?: Array<{ role: string; content: string }>;
      stream: boolean;
    } = {
      model: this.modelId,
      stream: true,
    };

    const requestHeaders: Record<string, string> = {
      ...this.sdkOptions.headers,
      ...headers,
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.sdkOptions.apiKey}`,
    };

    if (promptId) {
      requestHeaders["HTTP-Prompt-Id"] = promptId;
      if (!useCachedPrompt) {
        requestBody.messages = transformMessagesForAPI(prompt);
      } else {
        // When using cached prompt, provide empty array as API still expects messages field
        requestBody.messages = [];
      }
    } else {
      requestBody.messages = transformMessagesForAPI(prompt);
    }

    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: requestHeaders,
        body: JSON.stringify(requestBody),
        signal: options.abortSignal,
      });
    } catch (error) {
      throw new PromptrunConnectionError(
        `Failed to connect to the API: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }

    if (!response.ok) {
      const errorBody = await response.text();
      const errorOptions = {
        status: response.status,
        headers: headersToRecord(response.headers),
      };

      if (response.status === 401) {
        throw new PromptrunAuthenticationError(
          `Authentication failed: ${errorBody}`,
          errorOptions
        );
      }

      throw new PromptrunAPIError(
        `API call failed with status ${response.status}. Body: ${errorBody}`,
        errorOptions
      );
    }

    if (response.body === null) {
      throw new Error("Expected a streaming response body, but received null.");
    }

    return {
      stream: response.body.pipeThrough(createPromptrunStream()),
      response: {
        headers: headersToRecord(response.headers),
        status: response.status,
        statusText: response.statusText,
      },
      rawCall: {
        rawPrompt: prompt,
        rawSettings: {
          model: this.modelId,
          stream: true,
          ...options,
        },
      },
      request: {
        body: JSON.stringify(requestBody),
      },
    };
  }
}
