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
 *
 * The AI SDK uses content as an array of content parts, but the Promptrun API
 * expects a simple string. This function extracts text content from the message
 * parts and formats them for API consumption.
 *
 * @param {LanguageModelV1Prompt} messages - The messages from the AI SDK in the format expected by Vercel AI SDK
 * @returns {Array<{role: string, content: string}>} Messages formatted for the Promptrun API
 *
 * @example
 * ```typescript
 * const messages = [
 *   { role: "user", content: "Hello" },
 *   { role: "assistant", content: [{ type: "text", text: "Hi there!" }] }
 * ];
 *
 * const apiMessages = transformMessagesForAPI(messages);
 * // Result: [
 * //   { role: "user", content: "Hello" },
 * //   { role: "assistant", content: "Hi there!" }
 * // ]
 * ```
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
 *
 * This is necessary in environments where TypeScript's `lib` configuration
 * for "DOM.AsyncIterable" is not correctly picked up, or when working with
 * Node.js streams that need to be consumed with `for...await...of` syntax.
 *
 * @template T The type of data in the stream
 * @param {ReadableStream<T>} stream - The stream to convert to an async iterable
 * @returns {AsyncIterable<T>} An async iterable that can be used with for...await...of loops
 *
 * @example
 * ```typescript
 * const stream = new ReadableStream({
 *   start(controller) {
 *     controller.enqueue("Hello");
 *     controller.enqueue("World");
 *     controller.close();
 *   }
 * });
 *
 * const iterable = asAsyncIterable(stream);
 * for await (const chunk of iterable) {
 *   console.log(chunk); // "Hello", then "World"
 * }
 * ```
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
 *
 * This is necessary in environments where modern iterator methods are not
 * found on the `Headers` type due to an incomplete `lib` configuration.
 * The function iterates through all headers and creates a plain object.
 *
 * @param {Headers} headers - The `Headers` object from a fetch response
 * @returns {Record<string, string>} A plain object representing the headers
 *
 * @example
 * ```typescript
 * const response = await fetch("https://api.example.com");
 * const headers = headersToRecord(response.headers);
 * // Result: { "content-type": "application/json", "x-custom": "value" }
 * ```
 */
function headersToRecord(headers: Headers): Record<string, string> {
  const record: Record<string, string> = {};
  headers.forEach((value, key) => {
    record[key] = value;
  });
  return record;
}

/**
 * The core language model implementation for the Promptrun provider.
 *
 * This class adapts the Promptrun API to the `LanguageModelV1` interface required
 * by the Vercel AI SDK. It handles:
 * - API communication with the Promptrun backend
 * - Message format conversion between AI SDK and API formats
 * - Streaming and non-streaming text generation
 * - Prompt caching support
 * - Error handling and retry logic
 *
 * The class implements the `LanguageModelV1` interface, making it compatible
 * with all Vercel AI SDK functions like `generateText`, `streamText`, etc.
 *
 * @implements {LanguageModelV1}
 * @since 1.0.0
 *
 * @example
 * ```typescript
 * const promptrun = new PromptrunSDK("your-api-key");
 * const model = promptrun.model("openai/gpt-4o");
 *
 * // Use with Vercel AI SDK
 * import { generateText, streamText } from 'ai';
 *
 * // Generate text
 * const { text } = await generateText({
 *   model,
 *   prompt: "Tell me a joke"
 * });
 *
 * // Stream text
 * const { textStream } = await streamText({
 *   model,
 *   prompt: "Write a story"
 * });
 *
 * for await (const delta of textStream) {
 *   console.log(delta);
 * }
 * ```
 */
export class PromptrunLanguageModel implements LanguageModelV1 {
  /** The model identifier (e.g., "openai/gpt-4o") */
  readonly modelId: string;

  /** @private SDK configuration options */
  private readonly sdkOptions: PromptrunSDKOptions;

  /** @private Model-specific configuration options */
  private readonly modelOptions?: PromptrunLanguageModelOptions;

  /** The specification version this model implements */
  readonly specificationVersion = "v1" as const;

  /** Supported URL patterns (empty for this implementation) */
  readonly supportedUrls = {};

  /** Default object generation mode (undefined for text-only models) */
  readonly defaultObjectGenerationMode = undefined;

  /**
   * Creates a new PromptrunLanguageModel instance.
   *
   * @param {string} modelId - The model identifier (e.g., "openai/gpt-4o", "anthropic/claude-3-sonnet")
   * @param {PromptrunSDKOptions} sdkOptions - SDK configuration including API key and base URL
   * @param {PromptrunLanguageModelOptions} [modelOptions] - Optional model-specific configuration
   *
   * @example
   * ```typescript
   * const model = new PromptrunLanguageModel(
   *   "openai/gpt-4o",
   *   { apiKey: "your-key", baseURL: "https://your-api-endpoint.com/v1" },
   *   { cache: { id: "unique-cache-id" } }
   * );
   * ```
   */
  constructor(
    modelId: string,
    sdkOptions: PromptrunSDKOptions,
    modelOptions?: PromptrunLanguageModelOptions
  ) {
    this.modelId = modelId;
    this.sdkOptions = sdkOptions;
    this.modelOptions = modelOptions;
  }

  /**
   * Returns the provider identifier for this model.
   *
   * @returns {string} Always returns "promptrun"
   */
  get provider(): string {
    return "promptrun";
  }

  /**
   * Generates streaming text using the Promptrun API.
   *
   * This method implements the streaming interface required by the Vercel AI SDK.
   * It makes a request to the Promptrun API and returns a stream that can be
   * consumed with `for...await...of` loops.
   *
   * @param {LanguageModelV1CallOptions} options - The call options including prompt and settings
   * @returns {Promise<{stream: ReadableStream<LanguageModelV1StreamPart>, rawCall: any, rawResponse: any, request: any, warnings: string[]}>} Streaming response with metadata
   *
   * @throws {PromptrunAuthenticationError} When API authentication fails
   * @throws {PromptrunAPIError} When API returns an error
   * @throws {PromptrunConnectionError} When network communication fails
   *
   * @example
   * ```typescript
   * const { stream } = await model.doStream({
   *   prompt: [{ role: "user", content: "Tell me a story" }]
   * });
   *
   * for await (const part of asAsyncIterable(stream)) {
   *   if (part.type === "text-delta") {
   *     console.log(part.textDelta);
   *   }
   * }
   * ```
   */
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

  /**
   * Generates text using the Promptrun API and returns the complete result.
   *
   * This method implements the non-streaming interface required by the Vercel AI SDK.
   * It makes a request to the Promptrun API, consumes the entire stream, and returns
   * the complete generated text along with metadata like usage statistics.
   *
   * @param {LanguageModelV1CallOptions} options - The call options including prompt and settings
   * @returns {Promise<{text: string, finishReason: LanguageModelV1FinishReason, usage: {promptTokens: number, completionTokens: number}, rawCall: any, rawResponse: any, request: any, response: any, warnings: string[]}>} Complete generation result
   *
   * @throws {PromptrunAuthenticationError} When API authentication fails
   * @throws {PromptrunAPIError} When API returns an error
   * @throws {PromptrunConnectionError} When network communication fails
   *
   * @example
   * ```typescript
   * const { text, finishReason, usage } = await model.doGenerate({
   *   prompt: [{ role: "user", content: "What is 2+2?" }]
   * });
   *
   * console.log(text); // "2+2 equals 4"
   * console.log(finishReason); // "stop"
   * console.log(usage); // { promptTokens: 5, completionTokens: 8 }
   * ```
   */
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
   * Centralizes the logic for making API calls to the Promptrun backend.
   *
   * This private method handles:
   * - Building the API request with proper headers and authentication
   * - Supporting prompt caching via custom headers
   * - Converting AI SDK message format to API format
   * - Making the HTTP request with proper error handling
   * - Creating a streaming response that can be consumed by the AI SDK
   *
   * @private
   * @param {LanguageModelV1CallOptions} options - The call options from the AI SDK
   * @returns {Promise<{stream: ReadableStream<LanguageModelV1StreamPart>, response: any, rawCall: any, request: any}>} Streaming response with metadata
   * @throws {PromptrunAuthenticationError} When API authentication fails
   * @throws {PromptrunAPIError} When API returns an error
   * @throws {PromptrunConnectionError} When network communication fails
   */
  private async executeStreamRequest(options: LanguageModelV1CallOptions) {
    const url = `${this.sdkOptions.baseURL}/chat/completions`;
    const prompt: LanguageModelV1Prompt = options.prompt;

    const headers = { ...options.headers };

    // Handle prompt caching
    const promptId =
      headers["x-promptrun-cache-id"] ?? this.modelOptions?.cache?.id;
    const useCachedPrompt = headers["x-promptrun-use-cache"] === "true";

    // Clean up custom headers before sending to API
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

    // Handle prompt caching logic
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
