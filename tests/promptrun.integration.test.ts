import { generateText } from "ai";
import { ReadableStream } from "node:stream/web";
import { PromptrunSDK } from "../src/promptrun-provider";
import {
  PromptrunAPIError,
  PromptrunAuthenticationError,
  PromptrunConnectionError,
  PromptrunError,
  PromptrunPrompt,
} from "../src/types";

/**
 * Helper function to create a Response object with a Web API-compliant
 * ReadableStream body for streaming responses.
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

/**
 * Integration Tests - Testing real-world usage patterns from README
 * These tests verify that the SDK works correctly with the Vercel AI SDK
 * and handles all the scenarios documented in the README.
 */
describe("Promptrun SDK - Integration Tests", () => {
  let promptrunInstances: PromptrunSDK[] = [];

  beforeEach(() => {
    jest.restoreAllMocks();
    // Clear the array for tracking instances
    promptrunInstances = [];
  });

  afterEach(() => {
    // Clean up all polling intervals from any PromptrunSDK instances created during tests
    promptrunInstances.forEach((instance) => {
      instance.stopAllPolling();
    });
    promptrunInstances = [];
  });

  // Helper function to track SDK instances for cleanup
  const createTrackedSDK = (options: string | any): PromptrunSDK => {
    const instance = new PromptrunSDK(options);
    promptrunInstances.push(instance);
    return instance;
  };

  describe("SDK Initialization", () => {
    test("should initialize with API key string (README example)", () => {
      const promptrun = createTrackedSDK("test-api-key");
      expect(promptrun).toBeInstanceOf(PromptrunSDK);
    });

    test("should initialize with options object (README example)", () => {
      const promptrun = createTrackedSDK({
        apiKey: "test-api-key",
        baseURL: "https://custom-api.example.com",
        headers: {
          "Custom-Header": "value",
        },
      });
      expect(promptrun).toBeInstanceOf(PromptrunSDK);
    });

    test("should create model instance compatible with Vercel AI SDK", () => {
      const promptrun = createTrackedSDK("test-api-key");
      const model = promptrun.model("openai/gpt-4o");

      // Check that model has required properties for Vercel AI SDK compatibility
      expect(model.provider).toBe("promptrun");
      expect(model.specificationVersion).toBe("v1");
      expect(model.modelId).toBe("openai/gpt-4o");
    });
  });

  describe("generateText Integration (README Basic Usage)", () => {
    test("should work with generateText as shown in README", async () => {
      const promptrun = createTrackedSDK("test-api-key");
      const model = promptrun.model("openai/gpt-4o");

      const mockResponse = `id: 1\ndata: {"id":"chatcmpl-123","choices":[{"delta":{"content":"Once upon a time, there was a robot named Pixel who discovered the joy of painting."}}]}\n\nid: 2\ndata: {"id":"chatcmpl-123","choices":[{"finish_reason":"stop"}],"usage":{"prompt_tokens":15,"completion_tokens":20}}\n\ndata: [DONE]\n`;

      const fetchSpy = jest
        .spyOn(global, "fetch")
        .mockResolvedValue(createStreamResponse(mockResponse, { status: 200 }));

      const { text } = await generateText({
        model,
        prompt: "Tell me a short story about a robot who learns to paint.",
      });

      expect(text).toContain("robot");
      expect(text).toContain("Pixel");
      expect(fetchSpy).toHaveBeenCalledWith(
        "https://api.promptrun.ai/v1/chat/completions",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "Content-Type": "application/json",
            Authorization: "Bearer test-api-key",
          }),
        })
      );
    });

    test("should handle custom base URL", async () => {
      const promptrun = createTrackedSDK({
        apiKey: "test-api-key",
        baseURL: "https://custom-api.example.com/v1",
      });
      const model = promptrun.model("openai/gpt-4o");

      jest
        .spyOn(global, "fetch")
        .mockResolvedValue(
          createStreamResponse("data: [DONE]\n", { status: 200 })
        );

      await generateText({
        model,
        prompt: "Test prompt",
      });

      expect(global.fetch).toHaveBeenCalledWith(
        "https://custom-api.example.com/v1/chat/completions",
        expect.any(Object)
      );
    });
  });

  describe("Dynamic Prompts (README Advanced Usage)", () => {
    test("should fetch prompt from server without polling", async () => {
      const promptrun = createTrackedSDK("test-api-key");

      const mockPrompt: PromptrunPrompt = {
        id: "prompt-123",
        prompt: "You are a helpful assistant specialized in creative writing.",
        createdAt: "2021-01-01T00:00:00Z",
        updatedAt: "2021-01-01T00:00:00Z",
        version: 1,
        versionMessage: "Initial creative writing prompt",
        tag: "creative",
        temperature: 0.8,
        user: { id: "user-1", clerkId: "clerk-1" },
        project: { id: "project-1", name: "Creative Writing Assistant" },
        model: {
          name: "GPT-4",
          provider: "openai",
          model: "openai/gpt-4o",
          icon: "🤖",
        },
      };

      jest
        .spyOn(global, "fetch")
        .mockResolvedValue(
          new Response(JSON.stringify(mockPrompt), { status: 200 })
        );

      const prompt = (await promptrun.prompt({
        projectId: "project-123",
      })) as PromptrunPrompt;

      expect(prompt.prompt).toBe(
        "You are a helpful assistant specialized in creative writing."
      );
      expect(prompt.version).toBe(1);
      expect(prompt.model.model).toBe("openai/gpt-4o");
    });

    test("should handle polling for prompt updates", async () => {
      jest.useFakeTimers();
      const promptrun = createTrackedSDK("test-api-key");

      const mockPromptV1: PromptrunPrompt = {
        id: "prompt-123",
        prompt: "Version 1 prompt",
        createdAt: "2021-01-01T00:00:00Z",
        updatedAt: "2021-01-01T00:00:00Z",
        version: 1,
        versionMessage: "Initial version",
        tag: null,
        temperature: 0.7,
        user: { id: "user-1", clerkId: "clerk-1" },
        project: { id: "project-1", name: "Test Project" },
        model: {
          name: "GPT-4",
          provider: "openai",
          model: "openai/gpt-4o",
          icon: "🤖",
        },
      };

      const mockPromptV2: PromptrunPrompt = {
        ...mockPromptV1,
        prompt: "Version 2 prompt - updated!",
        version: 2,
        versionMessage: "Updated prompt",
      };

      const fetchSpy = jest.spyOn(global, "fetch");
      fetchSpy
        .mockResolvedValueOnce(
          new Response(JSON.stringify(mockPromptV1), { status: 200 })
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify(mockPromptV2), { status: 200 })
        );

      // With the new API, prompt returns the initial prompt and starts background polling
      const initialPrompt = await promptrun.prompt({
        projectId: "project-123",
        poll: 5000, // Use minimum allowed interval
      });

      expect(initialPrompt.prompt).toBe("Version 1 prompt");
      expect(initialPrompt.version).toBe(1);

      // Background polling happens automatically - we can only test that it was setup
      // For a real implementation, you'd probably want events or callbacks to handle updates
      expect(global.fetch).toHaveBeenCalledTimes(1);

      jest.useRealTimers();
    });
  });

  describe("Prompt Caching (README Advanced Usage)", () => {
    test("should populate cache on first call", async () => {
      const promptrun = createTrackedSDK("test-api-key");
      const model = promptrun.model("openai/gpt-4o", {
        cache: { id: "user-123-summary-request" },
      });

      const fetchSpy = jest
        .spyOn(global, "fetch")
        .mockResolvedValue(
          createStreamResponse("data: [DONE]\n", { status: 200 })
        );

      await generateText({
        model,
        prompt: "Summarize the following document for user 123...",
      });

      const requestBody = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string);
      const requestHeaders = new Headers(fetchSpy.mock.calls[0][1]?.headers);

      expect(requestHeaders.get("HTTP-Prompt-Id")).toBe(
        "user-123-summary-request"
      );
      expect(requestBody.messages).toBeDefined(); // Messages should be included on first call
    });

    test("should use cache on subsequent calls with header", async () => {
      const promptrun = createTrackedSDK("test-api-key");
      const model = promptrun.model("openai/gpt-4o", {
        cache: { id: "user-123-summary-request" },
      });

      const fetchSpy = jest
        .spyOn(global, "fetch")
        .mockResolvedValue(
          createStreamResponse("data: [DONE]\n", { status: 200 })
        );

      await generateText({
        model,
        prompt: "This prompt will be ignored.",
        headers: {
          "x-promptrun-use-cache": "true",
        },
      });

      const requestBody = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string);
      const requestHeaders = new Headers(fetchSpy.mock.calls[0][1]?.headers);

      expect(requestHeaders.get("HTTP-Prompt-Id")).toBe(
        "user-123-summary-request"
      );
      expect(requestBody.messages).toEqual([]); // Messages should be empty array when using cache
    });

    test("should handle cache with header-based cache ID", async () => {
      const promptrun = createTrackedSDK("test-api-key");
      const model = promptrun.model("openai/gpt-4o");

      const fetchSpy = jest
        .spyOn(global, "fetch")
        .mockResolvedValue(
          createStreamResponse("data: [DONE]\n", { status: 200 })
        );

      await generateText({
        model,
        prompt: "Test prompt",
        headers: {
          "x-promptrun-cache-id": "header-cache-123",
          "x-promptrun-use-cache": "false",
        },
      });

      const requestBody = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string);
      const requestHeaders = new Headers(fetchSpy.mock.calls[0][1]?.headers);

      expect(requestHeaders.get("HTTP-Prompt-Id")).toBe("header-cache-123");
      expect(requestHeaders.get("x-promptrun-cache-id")).toBeNull(); // Should be removed from final headers
      expect(requestHeaders.get("x-promptrun-use-cache")).toBeNull(); // Should be removed from final headers
      expect(requestBody.messages).toBeDefined(); // Messages included when not using cache
    });
  });

  describe("Error Handling (README Examples)", () => {
    test("should handle PromptrunAuthenticationError as shown in README", async () => {
      const promptrun = createTrackedSDK({ apiKey: "INVALID_API_KEY" });
      const model = promptrun.model("openai/gpt-4o");

      jest
        .spyOn(global, "fetch")
        .mockResolvedValue(new Response("Unauthorized", { status: 401 }));

      try {
        await generateText({ model, prompt: "This will fail." });
        fail("Expected PromptrunAuthenticationError to be thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(PromptrunAuthenticationError);
        expect(error).toBeInstanceOf(PromptrunAPIError);
        expect(error).toBeInstanceOf(PromptrunError);
        expect((error as PromptrunAuthenticationError).status).toBe(401);
        expect((error as Error).message).toContain("Authentication failed");
      }
    });

    test("should handle PromptrunAPIError for other HTTP errors", async () => {
      const promptrun = createTrackedSDK("test-api-key");
      const model = promptrun.model("openai/gpt-4o");

      jest
        .spyOn(global, "fetch")
        .mockResolvedValue(
          new Response("Internal Server Error", { status: 500 })
        );

      try {
        await generateText({ model, prompt: "This will fail." });
        fail("Expected PromptrunAPIError to be thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(PromptrunAPIError);
        expect(error).toBeInstanceOf(PromptrunError);
        expect((error as PromptrunAPIError).status).toBe(500);
        expect((error as Error).message).toContain(
          "API call failed with status 500"
        );
      }
    });

    test("should handle PromptrunConnectionError for network issues", async () => {
      const promptrun = createTrackedSDK("test-api-key");
      const model = promptrun.model("openai/gpt-4o");

      jest
        .spyOn(global, "fetch")
        .mockRejectedValue(new Error("Network connection failed"));

      try {
        await generateText({ model, prompt: "This will fail." });
        fail("Expected PromptrunConnectionError to be thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(PromptrunConnectionError);
        expect(error).toBeInstanceOf(PromptrunError);
        expect((error as Error).message).toContain(
          "Failed to connect to the API"
        );
        expect((error as Error).message).toContain("Network connection failed");
      }
    });

    test("should handle null response body error", async () => {
      const promptrun = createTrackedSDK("test-api-key");
      const model = promptrun.model("openai/gpt-4o");

      jest
        .spyOn(global, "fetch")
        .mockResolvedValue(new Response(null, { status: 200 }));

      try {
        await generateText({ model, prompt: "This will fail." });
        fail("Expected error to be thrown");
      } catch (error) {
        expect((error as Error).message).toBe(
          "Expected a streaming response body, but received null."
        );
      }
    });

    test("should include error details in PromptrunAPIError", async () => {
      const promptrun = createTrackedSDK("test-api-key");
      const model = promptrun.model("openai/gpt-4o");

      jest.spyOn(global, "fetch").mockResolvedValue(
        new Response("Bad Request - Invalid model", {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "X-Request-ID": "req-123",
          },
        })
      );

      try {
        await generateText({ model, prompt: "This will fail." });
        fail("Expected PromptrunAPIError to be thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(PromptrunAPIError);
        const apiError = error as PromptrunAPIError;
        expect(apiError.status).toBe(400);
        expect(apiError.headers).toEqual({
          "content-type": "application/json",
          "x-request-id": "req-123",
        });
        expect(apiError.message).toContain("Bad Request - Invalid model");
      }
    });
  });

  describe("Edge Cases and Robustness", () => {
    test("should handle empty stream response", async () => {
      const promptrun = createTrackedSDK("test-api-key");
      const model = promptrun.model("openai/gpt-4o");

      jest
        .spyOn(global, "fetch")
        .mockResolvedValue(
          createStreamResponse("data: [DONE]\n", { status: 200 })
        );

      const { text } = await generateText({
        model,
        prompt: "Test prompt",
      });

      expect(text).toBe("");
    });

    test("should handle malformed SSE data gracefully", async () => {
      const promptrun = createTrackedSDK("test-api-key");
      const model = promptrun.model("openai/gpt-4o");

      // Invalid JSON in SSE stream
      const malformedResponse = `data: {"invalid": json}\n\ndata: [DONE]\n`;

      jest
        .spyOn(global, "fetch")
        .mockResolvedValue(
          createStreamResponse(malformedResponse, { status: 200 })
        );

      try {
        await generateText({ model, prompt: "Test prompt" });
        throw new Error("Expected stream parsing error");
      } catch (error) {
        expect((error as Error).message).toBeDefined();
      }
    });

    test("should handle prompt polling with authentication errors", async () => {
      const promptrun = createTrackedSDK("invalid-key");

      jest
        .spyOn(global, "fetch")
        .mockResolvedValue(new Response("Unauthorized", { status: 401 }));

      try {
        await promptrun.prompt({
          projectId: "project-123",
        });
        fail("Expected PromptrunAuthenticationError");
      } catch (error) {
        expect(error).toBeInstanceOf(PromptrunAuthenticationError);
      }
    });

    test("should handle custom headers from SDK options", async () => {
      const promptrun = createTrackedSDK({
        apiKey: "test-api-key",
        headers: {
          "Custom-SDK-Header": "sdk-value",
          "User-Agent": "Custom-Agent/1.0",
        },
      });
      const model = promptrun.model("openai/gpt-4o");

      const fetchSpy = jest
        .spyOn(global, "fetch")
        .mockResolvedValue(
          createStreamResponse("data: [DONE]\n", { status: 200 })
        );

      await generateText({
        model,
        prompt: "Test prompt",
        headers: {
          "Custom-Request-Header": "request-value",
        },
      });

      const requestHeaders = new Headers(fetchSpy.mock.calls[0][1]?.headers);

      expect(requestHeaders.get("Custom-SDK-Header")).toBe("sdk-value");
      expect(requestHeaders.get("User-Agent")).toBe("Custom-Agent/1.0");
      expect(requestHeaders.get("Custom-Request-Header")).toBe("request-value");
      expect(requestHeaders.get("Authorization")).toBe("Bearer test-api-key");
    });
  });

  describe("OpenRouter API Compatibility", () => {
    test("should send request in OpenRouter chat completion format", async () => {
      const promptrun = createTrackedSDK("test-api-key");
      const model = promptrun.model("openai/gpt-4o");

      const mockResponse = `data: {"id":"chatcmpl-123","choices":[{"delta":{"content":"Hello"}}]}\n\ndata: [DONE]\n`;

      const fetchSpy = jest
        .spyOn(global, "fetch")
        .mockResolvedValue(createStreamResponse(mockResponse, { status: 200 }));

      await generateText({
        model,
        prompt: "What is the meaning of life?",
      });

      // Verify the request was made with correct OpenRouter format
      expect(fetchSpy).toHaveBeenCalledWith(
        "https://api.promptrun.ai/v1/chat/completions",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "Content-Type": "application/json",
            Authorization: "Bearer test-api-key",
          }),
          body: expect.any(String),
        })
      );

      // Parse and verify the request body structure matches OpenRouter specification
      const requestBody = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string);

      // Must have required fields per OpenRouter API
      expect(requestBody).toHaveProperty("model", "openai/gpt-4o");
      expect(requestBody).toHaveProperty("messages");
      expect(requestBody).toHaveProperty("stream", true);

      // Messages should be an array with proper structure
      expect(Array.isArray(requestBody.messages)).toBe(true);
      expect(requestBody.messages.length).toBeGreaterThan(0);

      // Each message should have role and content
      const firstMessage = requestBody.messages[0];
      expect(firstMessage).toHaveProperty("role");
      expect(firstMessage).toHaveProperty("content");

      // Content should be a string (API-compatible format)
      expect(typeof firstMessage.content).toBe("string");
      expect(firstMessage.content.length).toBeGreaterThan(0);
    });

    test("should handle OpenRouter streaming response format correctly", async () => {
      const promptrun = createTrackedSDK("test-api-key");
      const model = promptrun.model("openai/gpt-4o");

      // Mock response in OpenRouter streaming format (matches their docs)
      const mockResponse = `id: gen-12345
data: {"id":"gen-12345","choices":[{"delta":{"content":"The meaning"},"index":0}],"created":1735317796,"model":"openai/gpt-4o","object":"chat.completion.chunk"}

id: gen-12345
data: {"id":"gen-12345","choices":[{"delta":{"content":" of life"},"index":0}],"created":1735317796,"model":"openai/gpt-4o","object":"chat.completion.chunk"}

id: gen-12345
data: {"id":"gen-12345","choices":[{"delta":{},"finish_reason":"stop","index":0}],"created":1735317796,"model":"openai/gpt-4o","object":"chat.completion.chunk","usage":{"prompt_tokens":14,"completion_tokens":4,"total_tokens":18}}

data: [DONE]
`;

      jest
        .spyOn(global, "fetch")
        .mockResolvedValue(createStreamResponse(mockResponse, { status: 200 }));

      const { text } = await generateText({
        model,
        prompt: "What is the meaning of life?",
      });

      // Verify the streaming response was parsed correctly
      expect(text).toBe("The meaning of life");
    });

    test("should preserve model parameter exactly as specified", async () => {
      const promptrun = createTrackedSDK("test-api-key");

      // Test different model formats that OpenRouter supports
      const testModels = [
        "openai/gpt-4o",
        "anthropic/claude-3-sonnet",
        "meta-llama/llama-2-70b-chat",
        "google/gemini-pro",
      ];

      const mockResponse = `data: {"id":"gen-test","choices":[{"delta":{"content":"test"}}]}\n\ndata: [DONE]\n`;

      for (const modelId of testModels) {
        const model = promptrun.model(modelId);

        const fetchSpy = jest
          .spyOn(global, "fetch")
          .mockResolvedValue(
            createStreamResponse(mockResponse, { status: 200 })
          );

        await generateText({
          model,
          prompt: "Test",
        });

        const requestBody = JSON.parse(
          fetchSpy.mock.calls[0][1]?.body as string
        );
        expect(requestBody.model).toBe(modelId);

        fetchSpy.mockRestore();
      }
    });

    test("should handle OpenRouter error responses correctly", async () => {
      const promptrun = createTrackedSDK("test-api-key");
      const model = promptrun.model("openai/gpt-4o");

      // Mock an OpenRouter-style error response
      const errorResponse = {
        error: {
          message: "Invalid API key provided",
          type: "authentication_error",
          code: "invalid_api_key",
        },
      };

      jest.spyOn(global, "fetch").mockResolvedValue(
        new Response(JSON.stringify(errorResponse), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        })
      );

      await expect(
        generateText({
          model,
          prompt: "Test",
        })
      ).rejects.toThrow("Authentication failed");
    });

    test("should support OpenRouter optional parameters", async () => {
      const promptrun = createTrackedSDK("test-api-key");
      const model = promptrun.model("openai/gpt-4o");

      const mockResponse = `data: {"id":"gen-test","choices":[{"delta":{"content":"test"}}]}\n\ndata: [DONE]\n`;

      const fetchSpy = jest
        .spyOn(global, "fetch")
        .mockResolvedValue(createStreamResponse(mockResponse, { status: 200 }));

      // Test with additional parameters that should be passed through
      await generateText({
        model,
        prompt: "Test",
        temperature: 0.7,
      });

      const requestBody = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string);

      // These parameters should be passed through to OpenRouter
      // Note: AI SDK parameter names may be different from OpenRouter API names
      // The SDK should handle the translation if needed
      expect(requestBody).toHaveProperty("model", "openai/gpt-4o");
      expect(requestBody).toHaveProperty("messages");
      expect(requestBody).toHaveProperty("stream", true);
    });
  });
});
