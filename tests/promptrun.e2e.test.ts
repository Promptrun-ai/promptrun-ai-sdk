import { generateText } from "ai";
// Import the specific types needed for the direct .doStream() call
import { LanguageModelV1Prompt } from "@ai-sdk/provider";
import { ReadableStream } from "node:stream/web";
import { asAsyncIterable } from "../src/promptrun-language-model";
import { PromptrunSDK } from "../src/promptrun-provider";
import {
  PromptrunAPIError,
  PromptrunAuthenticationError,
  PromptrunConnectionError,
} from "../src/types";

/**
 * Helper function to create a Response object with a Web API-compliant
 * ReadableStream body.
 */
function createStreamResponse(body: string, options?: ResponseInit): Response {
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(body));
      controller.close();
    },
  });
  return new Response(stream as unknown as BodyInit, options);
}

describe("PromptrunSDK - E2E Tests", () => {
  let promptrun: PromptrunSDK;
  let promptrunInstances: PromptrunSDK[] = [];

  beforeEach(() => {
    jest.restoreAllMocks();
    // Clear environment variable to ensure tests use constructor baseURL
    delete process.env.PROMPTRUN_BASE_URL;
    promptrun = new PromptrunSDK({
      apiKey: "test-api-key",
      baseURL: "https://api.example.com/v1",
    });
    promptrunInstances = [promptrun];
  });

  afterEach(() => {
    // Clean up all polling intervals from any PromptrunSDK instances created during tests
    promptrunInstances.forEach((instance) => {
      instance.stopAllPolling();
    });
    promptrunInstances = [];
  });

  test('provider getter should return "promptrun"', () => {
    const testPromptrun = new PromptrunSDK({
      apiKey: "test-api-key",
      baseURL: "https://api.example.com/v1",
    });
    promptrunInstances.push(testPromptrun);
    const model = testPromptrun.model("test-model");
    expect(model.provider).toBe("promptrun");
  });

  test("should return a complete text response for generateText", async () => {
    const model = promptrun.model("test-model");
    const mockResponse = `id: 1\ndata: {"id":"chatcmpl-123","choices":[{"delta":{"content":"Hello"}}]}\n\nid: 2\ndata: {"id":"chatcmpl-123","choices":[{"delta":{"content":" world!"}}]}\n\nid: 3\ndata: {"id":"chatcmpl-123","choices":[{"finish_reason":"stop"}]}\n\nid: 4\ndata: [DONE]\n`;

    const fetchSpy = jest
      .spyOn(global, "fetch")
      .mockResolvedValue(createStreamResponse(mockResponse, { status: 200 }));

    const result = await generateText({
      model,
      prompt: "Say hello",
    });

    expect(result.text).toBe("Hello world!");
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.example.com/v1/chat/completions",
      expect.anything()
    );
  });

  test("should stream a text response correctly by calling doStream directly", async () => {
    const model = promptrun.model("test-model");
    const mockResponse = `id: 1\ndata: {"id":"chatcmpl-123","choices":[{"delta":{"content":"This "}}]}\n\nid: 2\ndata: {"id":"chatcmpl-123","choices":[{"delta":{"content":"is "}}]}\n\nid: 3\ndata: {"id":"chatcmpl-123","choices":[{"delta":{"content":"a test."}}]}\n\nid: 4\ndata: {"id":"chatcmpl-123","choices":[{"finish_reason":"stop"}]}\n\nid: 5\ndata: [DONE]\n`;

    jest
      .spyOn(global, "fetch")
      .mockResolvedValue(createStreamResponse(mockResponse, { status: 200 }));

    // Act: Bypass `streamText` and call the core `doStream` method directly.
    // FIX: The prompt content must be an array of structured parts.
    const prompt: LanguageModelV1Prompt = [
      {
        role: "user",
        content: [{ type: "text", text: "Generate the Fibonacci sequence" }],
      },
    ];

    const { stream } = await model.doStream({
      prompt,
      inputFormat: "messages",
      mode: { type: "regular" },
    });

    // Assert: Check that the stream contains text data and finish markers
    let fullText = "";
    for await (const value of asAsyncIterable(stream)) {
      if (value.type === "text-delta") {
        fullText += value.textDelta;
      } else if (value.type === "finish") {
        expect(value.finishReason).toBeDefined();
      }
    }

    expect(fullText.length).toBeGreaterThan(0);
  });

  test("stream iterator should clean up correctly on early exit", async () => {
    const model = promptrun.model("test-model");
    const mockResponse = `id: 1\ndata: {"id":"chatcmpl-123","choices":[{"delta":{"content":"This "}}]}\n\nid: 2\ndata: {"id":"chatcmpl-123","choices":[{"delta":{"content":"is "}}]}\n\n`;

    jest
      .spyOn(global, "fetch")
      .mockResolvedValue(createStreamResponse(mockResponse, { status: 200 }));

    const prompt: LanguageModelV1Prompt = [
      {
        role: "user",
        content: [{ type: "text", text: "Stream a test sentence." }],
      },
    ];
    const { stream } = await model.doStream({
      prompt,
      inputFormat: "messages",
      mode: { type: "regular" },
    });

    let chunkCount = 0;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const _ of asAsyncIterable(stream)) {
      chunkCount++;
      if (chunkCount === 1) {
        break;
      }
    }
    expect(chunkCount).toBe(1);
  });

  test("should handle tool-calls finish reason", async () => {
    const model = promptrun.model("test-model");

    const mockResponse = `id: 1\ndata: {"id":"chatcmpl-123","choices":[{"finish_reason":"tool-calls"}]}\n\nid: 2\ndata: [DONE]\n`;
    jest
      .spyOn(global, "fetch")
      .mockResolvedValue(createStreamResponse(mockResponse, { status: 200 }));

    // Act: Use the `doGenerate` method directly for non-streaming completion
    const { finishReason } = await model.doGenerate({
      prompt: [{ role: "user", content: [{ type: "text", text: "test" }] }],
      inputFormat: "messages",
      mode: { type: "regular" },
    });

    expect(finishReason).toBe("tool-calls");
  });

  test("doStream method should work correctly for streaming", async () => {
    const model = promptrun.model("test-model") as any;
    const mockResponse = `id: 1\ndata: {"id":"chatcmpl-123","choices":[{"delta":{"content":"Hello"}}]}\n\nid: 2\ndata: [DONE]\n`;

    jest
      .spyOn(global, "fetch")
      .mockResolvedValue(createStreamResponse(mockResponse, { status: 200 }));

    const { stream } = await model.doStream({
      prompt: [{ role: "user", content: [{ type: "text", text: "test" }] }],
      inputFormat: "messages",
      mode: { type: "regular" },
    });

    expect(stream).toBeDefined();
  });

  test("doStream method should work correctly", async () => {
    const model = promptrun.model("test-model") as any;
    const mockResponse = `id: 1\ndata: {"id":"chatcmpl-123","choices":[{"delta":{"content":"Hello"}}]}\n\nid: 2\ndata: [DONE]\n`;

    jest
      .spyOn(global, "fetch")
      .mockResolvedValue(createStreamResponse(mockResponse, { status: 200 }));

    const { stream } = await model.doStream({
      prompt: [{ role: "user", content: [{ type: "text", text: "test" }] }],
    });

    expect(stream).toBeDefined();
  });

  describe("Prompt Caching", () => {
    test("should populate the cache on the first call", async () => {
      const model = promptrun.model("test-model", {
        cache: { id: "cache-id-123" },
      });
      const fetchSpy = jest
        .spyOn(global, "fetch")
        .mockResolvedValue(createStreamResponse(`data: [DONE]\n`));

      await generateText({
        model,
        prompt: "This is the prompt to be cached.",
      });

      const requestHeaders = new Headers(fetchSpy.mock.calls[0][1]?.headers);
      expect(requestHeaders.get("HTTP-Prompt-Id")).toBe("cache-id-123");
    });

    test("should use the cached prompt on a subsequent call", async () => {
      const model = promptrun.model("test-model", {
        cache: { id: "cache-id-123" },
      });
      const fetchSpy = jest
        .spyOn(global, "fetch")
        .mockResolvedValue(createStreamResponse(`data: [DONE]\n`));

      await generateText({
        model,
        prompt: "This is a new prompt.",
        headers: { "x-promptrun-use-cache": "true" },
      });

      const requestHeaders = new Headers(fetchSpy.mock.calls[0][1]?.headers);
      expect(requestHeaders.get("HTTP-Prompt-Id")).toBe("cache-id-123");
    });

    test("should send messages when cache is provided but not using cached prompt", async () => {
      const model = promptrun.model("test-model");
      const fetchSpy = jest
        .spyOn(global, "fetch")
        .mockResolvedValue(createStreamResponse(`data: [DONE]\n`));

      await generateText({
        model,
        prompt: "This is a new prompt.",
        headers: {
          "x-promptrun-cache-id": "cache-id-123",
          "x-promptrun-use-cache": "false",
        },
      });

      const requestBody = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string);
      expect(requestBody.messages).toBeDefined();
    });
  });

  describe("Error Handling", () => {
    test("should throw an error if the response body is null", async () => {
      const model = promptrun.model("test-model");

      jest
        .spyOn(global, "fetch")
        .mockResolvedValue(new Response(null, { status: 200 }));

      await expect(
        generateText({ model, prompt: "this will fail" })
      ).rejects.toThrow(
        "Expected a streaming response body, but received null."
      );
    });

    test("should throw PromptrunAuthenticationError on 401 status", async () => {
      const model = promptrun.model("test-model");
      jest
        .spyOn(global, "fetch")
        .mockResolvedValue(new Response("Invalid API Key", { status: 401 }));

      await expect(
        generateText({ model, prompt: "this will fail" })
      ).rejects.toThrow(PromptrunAuthenticationError);
    });

    test("should throw PromptrunAPIError on other non-200 status codes", async () => {
      const model = promptrun.model("test-model");
      jest
        .spyOn(global, "fetch")
        .mockResolvedValue(new Response("Server meltdown", { status: 500 }));

      await expect(
        generateText({ model, prompt: "this will fail" })
      ).rejects.toThrow(PromptrunAPIError);
    });

    test("should throw PromptrunConnectionError on network failure", async () => {
      const model = promptrun.model("test-model");

      // Mock fetch to reject with an error
      jest
        .spyOn(global, "fetch")
        .mockRejectedValue(new Error("Network connection failed"));

      await expect(
        generateText({ model, prompt: "this will fail" })
      ).rejects.toThrow(PromptrunConnectionError);
    });
  });
});
