import { LanguageModelV1StreamPart } from "@ai-sdk/provider";
import {
  createPromptrunStream,
  parsePromptVariables,
} from "../src/stream-utils";

/**
 * A type-safe helper function to consume a ReadableStream and return its chunks as an array.
 * @template T The type of the chunks in the stream.
 * @param stream The ReadableStream to consume.
 * @returns A promise that resolves to an array of chunks of type T.
 */
async function streamToArray<T>(stream: ReadableStream<T>): Promise<T[]> {
  const reader = stream.getReader();
  const chunks: T[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    chunks.push(value);
  }
  return chunks;
}

describe("Unit Test: createPromptrunStream", () => {
  it("should correctly parse a valid SSE stream into text-delta and finish parts", async () => {
    const inputChunks = [
      'id: 1\ndata: {"id":"c-1","choices":[{"delta":{"content":"Hello "}}]}\n\n',
      'id: 2\ndata: {"id":"c-2","choices":[{"delta":{"content":"World."}}]}\n\n',
      'id: 3\ndata: {"id":"c-3","choices":[{"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":5}}\n\n',
      "id: 4\ndata: [DONE]\n\n",
    ];
    const inputStream = new ReadableStream({
      start(controller) {
        for (const chunk of inputChunks) {
          controller.enqueue(new TextEncoder().encode(chunk));
        }
        controller.close();
      },
    });

    const transformedStream = inputStream.pipeThrough(createPromptrunStream());

    const resultParts = await streamToArray<LanguageModelV1StreamPart>(
      transformedStream
    );

    expect(resultParts).toHaveLength(3);
    expect(resultParts[0]).toEqual({
      type: "text-delta",
      textDelta: "Hello ",
    });
    expect(resultParts[1]).toEqual({
      type: "text-delta",
      textDelta: "World.",
    });
    expect(resultParts[2]).toEqual({
      type: "finish",
      finishReason: "stop",
      usage: { promptTokens: 10, completionTokens: 5 },
    });
  });

  it("should emit an error part on malformed JSON data", async () => {
    const inputStream = new ReadableStream({
      start(controller) {
        const malformedData = 'data: {"id": "123", choices: []}\n\n';
        controller.enqueue(new TextEncoder().encode(malformedData));
        controller.close();
      },
    });

    const transformedStream = inputStream.pipeThrough(createPromptrunStream());

    const resultParts = await streamToArray<LanguageModelV1StreamPart>(
      transformedStream
    );

    expect(resultParts).toHaveLength(1);
    expect(resultParts[0].type).toBe("error");
  });

  it("should not process events with null data", async () => {
    const inputStream = new ReadableStream({
      start(controller) {
        const nullDataEvent = "data: \n\n";
        controller.enqueue(new TextEncoder().encode(nullDataEvent));
        controller.close();
      },
    });

    const transformedStream = inputStream.pipeThrough(createPromptrunStream());

    const resultParts = await streamToArray<LanguageModelV1StreamPart>(
      transformedStream
    );

    expect(resultParts).toHaveLength(0);
  });

  it("should handle empty event data", async () => {
    const inputStream = new ReadableStream({
      start(controller) {
        const emptyDataEvent = "data: \n\n";
        controller.enqueue(new TextEncoder().encode(emptyDataEvent));
        controller.close();
      },
    });

    const transformedStream = inputStream.pipeThrough(createPromptrunStream());
    const resultParts = await streamToArray<LanguageModelV1StreamPart>(
      transformedStream
    );

    expect(resultParts).toHaveLength(0);
  });

  it("should handle [DONE] event", async () => {
    const inputStream = new ReadableStream({
      start(controller) {
        const doneEvent = "data: [DONE]\n\n";
        controller.enqueue(new TextEncoder().encode(doneEvent));
        controller.close();
      },
    });

    const transformedStream = inputStream.pipeThrough(createPromptrunStream());
    const resultParts = await streamToArray<LanguageModelV1StreamPart>(
      transformedStream
    );

    expect(resultParts).toHaveLength(0);
  });

  it("should handle events without choices array", async () => {
    const inputStream = new ReadableStream({
      start(controller) {
        const eventWithoutChoices = 'data: {"id":"test"}\n\n';
        controller.enqueue(new TextEncoder().encode(eventWithoutChoices));
        controller.close();
      },
    });

    const transformedStream = inputStream.pipeThrough(createPromptrunStream());
    const resultParts = await streamToArray<LanguageModelV1StreamPart>(
      transformedStream
    );

    expect(resultParts).toHaveLength(0);
  });

  it("should handle events with empty choices array", async () => {
    const inputStream = new ReadableStream({
      start(controller) {
        const eventWithEmptyChoices = 'data: {"id":"test","choices":[]}\n\n';
        controller.enqueue(new TextEncoder().encode(eventWithEmptyChoices));
        controller.close();
      },
    });

    const transformedStream = inputStream.pipeThrough(createPromptrunStream());
    const resultParts = await streamToArray<LanguageModelV1StreamPart>(
      transformedStream
    );

    expect(resultParts).toHaveLength(0);
  });

  it("should handle finish event without usage data", async () => {
    const inputStream = new ReadableStream({
      start(controller) {
        const finishWithoutUsage =
          'data: {"choices":[{"finish_reason":"stop"}]}\n\n';
        controller.enqueue(new TextEncoder().encode(finishWithoutUsage));
        controller.close();
      },
    });

    const transformedStream = inputStream.pipeThrough(createPromptrunStream());
    const resultParts = await streamToArray<LanguageModelV1StreamPart>(
      transformedStream
    );

    expect(resultParts).toHaveLength(1);
    expect(resultParts[0]).toEqual({
      type: "finish",
      finishReason: "stop",
      usage: { promptTokens: 0, completionTokens: 0 },
    });
  });
});

describe("parsePromptVariables", () => {
  test("should replace variables with provided values", () => {
    const prompt = "Hello {{name}}, welcome to {{platform}}!";
    const variables = {
      name: "John Doe",
      platform: "Promptrun",
    };

    const result = parsePromptVariables(prompt, variables);
    expect(result).toBe("Hello John Doe, welcome to Promptrun!");
  });

  test("should keep original placeholders for missing variables", () => {
    const prompt = "Hello {{name}}, your age is {{age}}";
    const variables = {
      name: "John Doe",
    };

    const result = parsePromptVariables(prompt, variables);
    expect(result).toBe("Hello John Doe, your age is {{age}}");
  });

  test("should handle empty variables object", () => {
    const prompt = "Hello {{name}}, welcome to {{platform}}!";
    const variables = {};

    const result = parsePromptVariables(prompt, variables);
    expect(result).toBe("Hello {{name}}, welcome to {{platform}}!");
  });

  test("should handle prompt with no variables", () => {
    const prompt = "Hello, this is a simple prompt without variables.";
    const variables = {
      name: "John Doe",
    };

    const result = parsePromptVariables(prompt, variables);
    expect(result).toBe("Hello, this is a simple prompt without variables.");
  });

  test("should convert variable values to strings", () => {
    const prompt = "Count: {{count}}, Active: {{active}}";
    const variables = {
      count: 42,
      active: true,
    };

    const result = parsePromptVariables(prompt, variables);
    expect(result).toBe("Count: 42, Active: true");
  });

  test("should handle multiple occurrences of the same variable", () => {
    const prompt = "{{greeting}} {{name}}! How are you, {{name}}?";
    const variables = {
      greeting: "Hello",
      name: "John",
    };

    const result = parsePromptVariables(prompt, variables);
    expect(result).toBe("Hello John! How are you, John?");
  });
});
