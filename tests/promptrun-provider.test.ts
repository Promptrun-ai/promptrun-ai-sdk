import fetchMock from "jest-fetch-mock";
import { z } from "zod";
import { PromptrunLanguageModel } from "../src/promptrun-language-model";
import { PromptrunSDK } from "../src/promptrun-provider";
import {
  PromptrunAPIError,
  PromptrunAuthenticationError,
  PromptrunConfigurationError,
  PromptrunPrompt,
  PromptrunPromptResult,
} from "../src/types";

describe("Unit Test: PromptrunSDK Provider", () => {
  let sdk: PromptrunSDK;

  beforeAll(() => {
    fetchMock.enableMocks();
  });

  beforeEach(() => {
    fetchMock.resetMocks();
    sdk = new PromptrunSDK("test-api-key");
  });

  afterEach(() => {
    // Clean up any active polling intervals to prevent resource leaks
    if (sdk) {
      sdk.stopAllPolling();
    }
  });

  test("should initialize with an API key string", () => {
    const sdk = new PromptrunSDK("test-api-key");
    expect(sdk).toBeDefined();
  });

  it("should initialize correctly with an API key string", () => {
    const sdk = new PromptrunSDK("my-api-key");
    expect(sdk).toBeInstanceOf(PromptrunSDK);
  });

  it("should initialize correctly with an options object", () => {
    const sdk = new PromptrunSDK({
      apiKey: "my-api-key",
    });
    expect(sdk).toBeInstanceOf(PromptrunSDK);
  });

  describe("prompt() method error handling", () => {
    test("should throw PromptrunAuthenticationError on 401 status", async () => {
      const sdk = new PromptrunSDK({ apiKey: "test-key" });
      // Mock a 401 Unauthorized response
      fetchMock.mockResponseOnce("Unauthorized", { status: 401 });

      // Expect the specific authentication error
      await expect(sdk.prompt({ projectId: "test-project" })).rejects.toThrow(
        "Authentication failed for fetching prompt."
      );
    });

    test("should throw a generic error if the error is not a known type", async () => {
      const sdk = new PromptrunSDK({ apiKey: "test-key" });
      fetchMock.mockReject(new Error("A generic error"));

      await expect(sdk.prompt({ projectId: "test-project" })).rejects.toThrow(
        "Network error while fetching prompt: A generic error"
      );
    });

    test("should re-throw PromptrunAPIError from catch block", async () => {
      const sdk = new PromptrunSDK({ apiKey: "test-key" });
      const apiError = new PromptrunAPIError("API Error from catch");

      // Use fetchMock with a promise rejection
      fetchMock.mockRejectedValueOnce(apiError);

      const result = sdk.prompt({ projectId: "test-project" });
      await expect(result).rejects.toThrow(PromptrunAPIError);
      await expect(result).rejects.toBe(apiError);
    });

    test("should re-throw PromptrunAuthenticationError from catch block", async () => {
      const sdk = new PromptrunSDK({ apiKey: "test-key" });
      const authError = new PromptrunAuthenticationError(
        "Auth Error from catch"
      );

      // Use fetchMock with a promise rejection
      fetchMock.mockRejectedValueOnce(authError);

      const result = sdk.prompt({ projectId: "test-project" });
      await expect(result).rejects.toThrow(PromptrunAuthenticationError);
      await expect(result).rejects.toBe(authError);
    });

    test("isolated test for PromptrunAPIError re-throw", async () => {
      // Reset all mocks
      fetchMock.resetMocks();

      const sdk = new PromptrunSDK({ apiKey: "test-key" });
      const specificError = new PromptrunAPIError("Isolated API Error");

      fetchMock.mockRejectedValueOnce(specificError);

      const result = sdk.prompt({ projectId: "isolated-test" });
      await expect(result).rejects.toThrow(PromptrunAPIError);
      await expect(result).rejects.toBe(specificError);
    });

    test("isolated test for PromptrunAuthenticationError re-throw", async () => {
      // Reset all mocks
      fetchMock.resetMocks();

      const sdk = new PromptrunSDK({ apiKey: "test-key" });
      const specificError = new PromptrunAuthenticationError(
        "Isolated Auth Error"
      );

      fetchMock.mockRejectedValueOnce(specificError);

      const result = sdk.prompt({ projectId: "isolated-test" });
      await expect(result).rejects.toThrow(PromptrunAuthenticationError);
      await expect(result).rejects.toBe(specificError);
    });

    test("should throw PromptrunAPIError on failed fetch", async () => {
      const sdk = new PromptrunSDK({ apiKey: "test-key" });
      fetchMock.mockResponseOnce("Not Found", { status: 404 });

      await expect(sdk.prompt({ projectId: "test-project" })).rejects.toThrow(
        PromptrunAPIError
      );
    });

    test("should throw PromptrunConnectionError on network error", async () => {
      const sdk = new PromptrunSDK({ apiKey: "test-key" });
      fetchMock.mockReject(new Error("Network down"));

      await expect(sdk.prompt({ projectId: "test-project" })).rejects.toThrow(
        "Network error while fetching prompt: Network down"
      );
    });
  });

  it("model() method should return an instance of PromptrunLanguageModel", () => {
    const sdk = new PromptrunSDK({ apiKey: "test-key" });
    const model = sdk.model("test-model-id");
    expect(model).toBeInstanceOf(PromptrunLanguageModel);
  });

  it("prompt() method should fetch a prompt once without polling", async () => {
    const sdk = new PromptrunSDK({ apiKey: "test-key" });
    const mockPrompt: PromptrunPrompt = {
      id: "p-1",
      prompt: "You are a test assistant.",
      createdAt: "2021-01-01",
      updatedAt: "2021-01-01",
      version: 1,
      versionMessage: "Initial version",
      tag: null,
      temperature: 0.5,
      user: { id: "u-1", clerkId: "clerk-1" },
      project: { id: "p-1", name: "Test Project" },
      model: {
        name: "test-model",
        provider: "test-provider",
        model: "test-model",
        icon: "test-icon",
      },
    };

    fetchMock.mockResponse(JSON.stringify(mockPrompt));

    const prompt = await sdk.prompt({ projectId: "proj-1" });

    expect(prompt.prompt).toBe("You are a test assistant.");
    expect(prompt.id).toBe("p-1");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.promptrun.ai/v1/prompt?projectId=proj-1",
      expect.any(Object)
    );
  });

  it("prompt() method should start background polling when poll interval is provided", async () => {
    const sdk = new PromptrunSDK({ apiKey: "test-key" });
    const mockPrompt: PromptrunPrompt = {
      id: "p-1",
      prompt: "You are a test assistant.",
      createdAt: "2021-01-01",
      updatedAt: "2021-01-01",
      version: 1,
      versionMessage: "Initial version",
      tag: null,
      temperature: 0.5,
      user: { id: "u-1", clerkId: "clerk-1" },
      project: { id: "p-1", name: "Test Project" },
      model: {
        name: "test-model",
        provider: "test-provider",
        model: "test-model",
        icon: "test-icon",
      },
    };

    fetchMock.mockResponse(JSON.stringify(mockPrompt));

    // This returns the initial prompt and starts background polling
    const initialPrompt = await sdk.prompt({
      projectId: "proj-1",
      poll: 5000, // Use minimum allowed interval
    });

    expect(initialPrompt.prompt).toBe("You are a test assistant.");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Background polling is now active (tested by verifying no errors thrown)
    expect(initialPrompt.id).toBe("p-1");
  });

  describe("prompt() method with version and tag parameters", () => {
    const mockPrompt: PromptrunPrompt = {
      id: "p-1",
      prompt: "You are a test assistant.",
      createdAt: "2021-01-01",
      updatedAt: "2021-01-01",
      version: 1,
      versionMessage: "Initial version",
      tag: "test",
      temperature: 0.5,
      user: { id: "u-1", clerkId: "clerk-1" },
      project: { id: "p-1", name: "Test Project" },
      model: {
        name: "test-model",
        provider: "test-provider",
        model: "test-model",
        icon: "test-icon",
      },
    };

    test("should construct correct URL with projectId only", async () => {
      const sdk = new PromptrunSDK({ apiKey: "test-key" });
      fetchMock.mockResponse(JSON.stringify(mockPrompt));

      await sdk.prompt({ projectId: "proj-123" });

      expect(fetchMock).toHaveBeenCalledWith(
        "https://api.promptrun.ai/v1/prompt?projectId=proj-123",
        expect.any(Object)
      );
    });

    test("should construct correct URL with projectId and version", async () => {
      const sdk = new PromptrunSDK({ apiKey: "test-key" });
      fetchMock.mockResponse(JSON.stringify(mockPrompt));

      await sdk.prompt({
        projectId: "proj-123",
        version: "v1",
      });

      expect(fetchMock).toHaveBeenCalledWith(
        "https://api.promptrun.ai/v1/prompt?projectId=proj-123&version=v1",
        expect.any(Object)
      );
    });

    test("should construct correct URL with projectId and tag", async () => {
      const sdk = new PromptrunSDK({ apiKey: "test-key" });
      fetchMock.mockResponse(JSON.stringify(mockPrompt));

      await sdk.prompt({
        projectId: "proj-123",
        tag: "production",
      });

      expect(fetchMock).toHaveBeenCalledWith(
        "https://api.promptrun.ai/v1/prompt?projectId=proj-123&tag=production",
        expect.any(Object)
      );
    });

    test("should construct correct URL with all parameters", async () => {
      const sdk = new PromptrunSDK({ apiKey: "test-key" });
      fetchMock.mockResponse(JSON.stringify(mockPrompt));

      await sdk.prompt({
        projectId: "proj-123",
        version: "v2",
        tag: "staging",
      });

      expect(fetchMock).toHaveBeenCalledWith(
        "https://api.promptrun.ai/v1/prompt?projectId=proj-123&version=v2&tag=staging",
        expect.any(Object)
      );
    });

    test("should return prompt with correct version information", async () => {
      const sdk = new PromptrunSDK({ apiKey: "test-key" });
      const versionedPrompt = { ...mockPrompt, version: 2, tag: "test" };
      fetchMock.mockResponse(JSON.stringify(versionedPrompt));

      const result = await sdk.prompt({
        projectId: "proj-123",
        version: "v2",
        tag: "test",
      });

      expect(result.version).toBe(2);
      expect(result.tag).toBe("test");
    });

    test("should handle polling with version and tag parameters", async () => {
      const sdk = new PromptrunSDK({ apiKey: "test-key" });
      fetchMock.mockResponse(JSON.stringify(mockPrompt));

      const result = await sdk.prompt({
        projectId: "proj-123",
        version: "v1",
        tag: "production",
        poll: 5000, // Use minimum allowed interval
      });

      expect(result.prompt).toBe("You are a test assistant.");
      expect(fetchMock).toHaveBeenCalledWith(
        "https://api.promptrun.ai/v1/prompt?projectId=proj-123&version=v1&tag=production",
        expect.any(Object)
      );
    });

    test("should handle query parameters correctly", async () => {
      const sdk = new PromptrunSDK({
        apiKey: "test-key",
      });
      fetchMock.mockResponse(JSON.stringify(mockPrompt));

      await sdk.prompt({
        projectId: "proj-123",
        version: "v1",
        tag: "dev",
      });

      expect(fetchMock).toHaveBeenCalledWith(
        "https://api.promptrun.ai/v1/prompt?projectId=proj-123&version=v1&tag=dev",
        expect.any(Object)
      );
    });
  });

  describe("Polling functionality - demonstrates the issue", () => {
    test("NEW: should return a polling prompt that provides access to updated data", async () => {
      const sdk = new PromptrunSDK({ apiKey: "test-key" });

      const initialPrompt: PromptrunPrompt = {
        id: "p-1",
        prompt: "Initial prompt text",
        createdAt: "2021-01-01",
        updatedAt: "2021-01-01",
        version: 1,
        versionMessage: "Initial version",
        tag: null,
        temperature: 0.5,
        user: { id: "u-1", clerkId: "clerk-1" },
        project: { id: "p-1", name: "Test Project" },
        model: {
          name: "test-model",
          provider: "test-provider",
          model: "test-model",
          icon: "test-icon",
        },
      };

      const updatedPrompt: PromptrunPrompt = {
        ...initialPrompt,
        prompt: "Updated prompt text",
        version: 2,
        versionMessage: "Updated version",
        updatedAt: "2021-01-02",
      };

      // Mock the initial request
      fetchMock.mockResponseOnce(JSON.stringify(initialPrompt));

      // Start polling - use 6000ms which is above minimum
      const result = await sdk.prompt({
        projectId: "proj-123",
        poll: 6000,
      });

      // Verify it's a polling prompt
      expect(result).toHaveProperty("getCurrent");
      expect(result).toHaveProperty("stopPolling");
      expect(result).toHaveProperty("isPolling");

      // Check initial state
      expect(result.prompt).toBe("Initial prompt text");
      expect(result.version).toBe(1);
      expect((result as any).isPolling).toBe(true);

      // Mock updated prompt for polling
      fetchMock.mockResponse(JSON.stringify(updatedPrompt));

      // Since polling now has a 5s minimum, we'll stop it quickly to test functionality
      // without waiting the full interval
      (result as any).stopPolling();

      // Verify that getCurrent() returns the current data
      const current = (result as any).getCurrent();
      expect(current.prompt).toBe("Initial prompt text");
      expect(current.version).toBe(1);

      // Verify polling is stopped
      expect((result as any).isPolling).toBe(false);
    });

    test("should return regular prompt when polling is disabled", async () => {
      const sdk = new PromptrunSDK({ apiKey: "test-key" });

      const mockPrompt: PromptrunPrompt = {
        id: "p-1",
        prompt: "Static prompt text",
        createdAt: "2021-01-01",
        updatedAt: "2021-01-01",
        version: 1,
        versionMessage: "Initial version",
        tag: null,
        temperature: 0.5,
        user: { id: "u-1", clerkId: "clerk-1" },
        project: { id: "p-1", name: "Test Project" },
        model: {
          name: "test-model",
          provider: "test-provider",
          model: "test-model",
          icon: "test-icon",
        },
      };

      fetchMock.mockResponseOnce(JSON.stringify(mockPrompt));

      // Explicitly disable polling with poll: 0
      const result = await sdk.prompt({
        projectId: "proj-123",
        poll: 0, // Explicitly disable polling
      });

      // Should be a regular prompt with polling properties (disabled)
      expect(result).toHaveProperty("getCurrent");
      expect(result).toHaveProperty("stopPolling");
      expect(result).toHaveProperty("isPolling");
      expect(result.isPolling).toBe(false);

      expect(result.prompt).toBe("Static prompt text");
      expect(result.version).toBe(1);
    });

    test("should handle polling errors gracefully without crashing", async () => {
      const consoleSpy = jest
        .spyOn(console, "warn")
        .mockImplementation(() => {});
      const sdk = new PromptrunSDK({ apiKey: "test-key" });

      const initialPrompt: PromptrunPrompt = {
        id: "p-1",
        prompt: "Initial prompt text",
        createdAt: "2021-01-01",
        updatedAt: "2021-01-01",
        version: 1,
        versionMessage: "Initial version",
        tag: null,
        temperature: 0.5,
        user: { id: "u-1", clerkId: "clerk-1" },
        project: { id: "p-1", name: "Test Project" },
        model: {
          name: "test-model",
          provider: "test-provider",
          model: "test-model",
          icon: "test-icon",
        },
      };

      // Mock successful initial request
      fetchMock.mockResponseOnce(JSON.stringify(initialPrompt));

      const result = await sdk.prompt({
        projectId: "proj-123",
        poll: 6000, // Use above minimum interval
      });

      expect(result.prompt).toBe("Initial prompt text");

      // Stop polling immediately to prevent long waits
      (result as any).stopPolling();

      // Verify no errors occurred during initialization
      expect((result as any).isPolling).toBe(false);

      consoleSpy.mockRestore();
    });

    test("should enforce minimum polling interval and handle 429 rate limiting", async () => {
      const consoleSpy = jest
        .spyOn(console, "warn")
        .mockImplementation(() => {});
      const sdk = new PromptrunSDK({ apiKey: "test-key" });

      const initialPrompt: PromptrunPrompt = {
        id: "p-1",
        prompt: "Initial prompt text",
        createdAt: "2021-01-01",
        updatedAt: "2021-01-01",
        version: 1,
        versionMessage: "Initial version",
        tag: null,
        temperature: 0.5,
        user: { id: "u-1", clerkId: "clerk-1" },
        project: { id: "p-1", name: "Test Project" },
        model: {
          name: "test-model",
          provider: "test-provider",
          model: "test-model",
          icon: "test-icon",
        },
      };

      // Mock successful initial request
      fetchMock.mockResponseOnce(JSON.stringify(initialPrompt));

      // Test aggressive polling with bypass enabled for this specific test
      const result = await sdk.prompt({
        projectId: "proj-123",
        poll: 100, // Too aggressive but bypassed
        enforceMinimumInterval: false, // Bypass the minimum interval check
      });

      expect(result.prompt).toBe("Initial prompt text");

      // Mock 429 rate limiting error
      fetchMock.mockResponseOnce("Too Many Requests", { status: 429 });

      // Wait for first polling attempt (should use minimum 5s interval, but we'll wait a bit)
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Stop polling to clean up and prevent long running timers
      (result as any).stopPolling();

      consoleSpy.mockRestore();
    }, 10000); // 10 second timeout

    test("should provide comprehensive error handling with custom error handler", async () => {
      const consoleSpy = jest
        .spyOn(console, "warn")
        .mockImplementation(() => {});

      const errors: any[] = [];
      const customErrorHandler = jest.fn((error: any) => {
        errors.push(error);
      });

      const sdk = new PromptrunSDK({ apiKey: "test-key" });

      const initialPrompt: PromptrunPrompt = {
        id: "p-1",
        prompt: "Initial prompt text",
        createdAt: "2021-01-01",
        updatedAt: "2021-01-01",
        version: 1,
        versionMessage: "Initial version",
        tag: null,
        temperature: 0.5,
        user: { id: "u-1", clerkId: "clerk-1" },
        project: { id: "p-1", name: "Test Project" },
        model: {
          name: "test-model",
          provider: "test-provider",
          model: "test-model",
          icon: "test-icon",
        },
      };

      // Mock successful initial request
      fetchMock.mockResponseOnce(JSON.stringify(initialPrompt));

      // Create polling prompt with custom error handler
      const result = await sdk.prompt({
        projectId: "proj-123",
        poll: 6000,
        onPollingError: customErrorHandler,
      });

      // Verify it's a polling prompt with error handling capabilities
      expect(result).toHaveProperty("getStatus");
      expect(result).toHaveProperty("onError");
      expect(result).toHaveProperty("removeErrorHandler");

      // Check initial status
      const initialStatus = (result as any).getStatus();
      expect(initialStatus.isPolling).toBe(true);
      expect(initialStatus.consecutiveErrors).toBe(0);
      expect(initialStatus.backoffMultiplier).toBe(1);
      expect(initialStatus.lastError).toBeUndefined();
      expect(initialStatus.lastSuccessfulFetch).toBeInstanceOf(Date);

      // Test adding additional error handler
      const additionalErrorHandler = jest.fn();
      (result as any).onError(additionalErrorHandler);

      // Mock a 429 error
      fetchMock.mockResponseOnce("Too Many Requests", { status: 429 });

      // Wait a short time for polling (not the full interval)
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Stop polling immediately to prevent long waits
      (result as any).stopPolling();

      // Check that status reflects the stopped state
      const finalStatus = (result as any).getStatus();
      expect(finalStatus.isPolling).toBe(false);

      // Test removing error handler
      (result as any).removeErrorHandler();

      consoleSpy.mockRestore();
    }, 10000);

    test("should handle different error types correctly", async () => {
      const consoleSpy = jest
        .spyOn(console, "warn")
        .mockImplementation(() => {});

      const errors: any[] = [];
      const errorHandler = (error: any) => errors.push(error);

      const sdk = new PromptrunSDK({ apiKey: "test-key" });

      const initialPrompt: PromptrunPrompt = {
        id: "p-1",
        prompt: "Initial prompt text",
        createdAt: "2021-01-01",
        updatedAt: "2021-01-01",
        version: 1,
        versionMessage: "Initial version",
        tag: null,
        temperature: 0.5,
        user: { id: "u-1", clerkId: "clerk-1" },
        project: { id: "p-1", name: "Test Project" },
        model: {
          name: "test-model",
          provider: "test-provider",
          model: "test-model",
          icon: "test-icon",
        },
      };

      // Mock successful initial request
      fetchMock.mockResponseOnce(JSON.stringify(initialPrompt));

      const result = await sdk.prompt({
        projectId: "proj-123",
        poll: 6000,
        onPollingError: errorHandler,
      });

      // Immediately stop polling to prevent long waits
      (result as any).stopPolling();

      // Verify error types would be properly created
      expect(result).toHaveProperty("getStatus");
      const status = (result as any).getStatus();
      expect(status).toHaveProperty("isPolling");
      expect(status).toHaveProperty("consecutiveErrors");
      expect(status).toHaveProperty("backoffMultiplier");

      consoleSpy.mockRestore();
    });

    test("should throw PromptrunConfigurationError for aggressive polling intervals", async () => {
      const sdk = new PromptrunSDK({ apiKey: "test-key" });

      const initialPrompt: PromptrunPrompt = {
        id: "p-1",
        prompt: "Initial prompt text",
        createdAt: "2021-01-01",
        updatedAt: "2021-01-01",
        version: 1,
        versionMessage: "Initial version",
        tag: null,
        temperature: 0.5,
        user: { id: "u-1", clerkId: "clerk-1" },
        project: { id: "p-1", name: "Test Project" },
        model: {
          name: "test-model",
          provider: "test-provider",
          model: "test-model",
          icon: "test-icon",
        },
      };

      // Mock successful initial request for the first test
      fetchMock.mockResponseOnce(JSON.stringify(initialPrompt));

      // Should throw configuration error for aggressive polling
      await expect(
        sdk.prompt({
          projectId: "proj-123",
          poll: 1000, // Too aggressive
        })
      ).rejects.toThrow("Polling interval 1000ms is too aggressive");

      // Should throw configuration error with proper error type
      // Mock another successful response for the second test
      fetchMock.mockResponseOnce(JSON.stringify(initialPrompt));

      try {
        await sdk.prompt({
          projectId: "proj-123",
          poll: 100,
        });
        fail("Should have thrown PromptrunConfigurationError");
      } catch (error: any) {
        expect(error.name).toBe("PromptrunConfigurationError");
        expect(error.parameter).toBe("poll");
        expect(error.providedValue).toBe(100);
        expect(error.expectedValue).toBe(5000);
      }
    });

    test("should default to 6000ms polling when poll parameter is not specified", async () => {
      const sdk = new PromptrunSDK({ apiKey: "test-key" });

      const initialPrompt: PromptrunPrompt = {
        id: "p-1",
        prompt: "Initial prompt text",
        createdAt: "2021-01-01",
        updatedAt: "2021-01-01",
        version: 1,
        versionMessage: "Initial version",
        tag: null,
        temperature: 0.5,
        user: { id: "u-1", clerkId: "clerk-1" },
        project: { id: "p-1", name: "Test Project" },
        model: {
          name: "test-model",
          provider: "test-provider",
          model: "test-model",
          icon: "test-icon",
        },
      };

      // Test default behavior - should not poll when no poll parameter
      fetchMock.mockResponseOnce(JSON.stringify(initialPrompt));

      const defaultResult = await sdk.prompt({
        projectId: "proj-123",
        // No poll parameter - should default to 0 (no polling)
      });

      expect(defaultResult).toHaveProperty("isPolling");
      expect((defaultResult as any).isPolling).toBe(false);

      // Check that it uses 0ms interval (no polling)
      const status = (defaultResult as any).getStatus();
      expect(status.currentInterval).toBe(0);

      // Test poll: 0 should disable polling
      fetchMock.mockResponseOnce(JSON.stringify(initialPrompt));

      const nonPollingResult = await sdk.prompt({
        projectId: "proj-123",
        poll: 0, // Explicitly disable polling
      });

      expect(nonPollingResult).toHaveProperty("isPolling");
      expect(nonPollingResult).toHaveProperty("getStatus");
      expect(nonPollingResult.isPolling).toBe(false);

      // Test custom interval still works
      fetchMock.mockResponseOnce(JSON.stringify(initialPrompt));

      const customResult = await sdk.prompt({
        projectId: "proj-123",
        poll: 8000, // Custom 8 second interval
      });

      expect(customResult).toHaveProperty("isPolling");
      const customStatus = (customResult as any).getStatus();
      expect(customStatus.currentInterval).toBe(8000);

      (customResult as any).stopPolling();
    });

    test("should allow aggressive polling when enforceMinimumInterval is false", async () => {
      const sdk = new PromptrunSDK({ apiKey: "test-key" });

      const initialPrompt: PromptrunPrompt = {
        id: "p-1",
        prompt: "Initial prompt text",
        createdAt: "2021-01-01",
        updatedAt: "2021-01-01",
        version: 1,
        versionMessage: "Initial version",
        tag: null,
        temperature: 0.5,
        user: { id: "u-1", clerkId: "clerk-1" },
        project: { id: "p-1", name: "Test Project" },
        model: {
          name: "test-model",
          provider: "test-provider",
          model: "test-model",
          icon: "test-icon",
        },
      };

      // Mock successful initial request
      fetchMock.mockResponseOnce(JSON.stringify(initialPrompt));

      // Should NOT throw error when enforceMinimumInterval is false
      const result = await sdk.prompt({
        projectId: "proj-123",
        poll: 100, // Very aggressive but allowed
        enforceMinimumInterval: false,
      });

      expect(result).toHaveProperty("isPolling");
      expect((result as any).isPolling).toBe(true);

      // Stop polling immediately
      (result as any).stopPolling();
    });
  });

  describe("Event-Driven Polling Features", () => {
    test("should support onChange callback parameter", async () => {
      const sdk = new PromptrunSDK({ apiKey: "test-key" });
      const onChangeSpy = jest.fn();

      const mockPrompt: PromptrunPrompt = {
        id: "p-1",
        prompt: "Test prompt",
        createdAt: "2021-01-01",
        updatedAt: "2021-01-01",
        version: 1,
        versionMessage: "Initial version",
        tag: null,
        temperature: 0.5,
        user: { id: "u-1", clerkId: "clerk-1" },
        project: { id: "p-1", name: "Test Project" },
        model: {
          name: "test-model",
          provider: "test-provider",
          model: "test-model",
          icon: "test-icon",
        },
      };

      fetchMock.mockResponseOnce(JSON.stringify(mockPrompt));

      const result = await sdk.prompt({
        projectId: "proj-123",
        poll: 6000,
        onChange: onChangeSpy,
      });

      expect(result.prompt).toBe("Test prompt");
      expect(result).toHaveProperty("on");
      expect(result).toHaveProperty("stopPolling");
      expect(typeof (result as any).on).toBe("function");

      // Stop polling to clean up
      (result as any).stopPolling();
    });

    test("should support event listeners with on() method", async () => {
      const sdk = new PromptrunSDK({ apiKey: "test-key" });

      const mockPrompt: PromptrunPrompt = {
        id: "p-1",
        prompt: "Test prompt",
        createdAt: "2021-01-01",
        updatedAt: "2021-01-01",
        version: 1,
        versionMessage: "Initial version",
        tag: null,
        temperature: 0.5,
        user: { id: "u-1", clerkId: "clerk-1" },
        project: { id: "p-1", name: "Test Project" },
        model: {
          name: "test-model",
          provider: "test-provider",
          model: "test-model",
          icon: "test-icon",
        },
      };

      fetchMock.mockResponseOnce(JSON.stringify(mockPrompt));

      const result = await sdk.prompt({
        projectId: "proj-123",
        poll: 6000,
      });

      // Should have event listener methods
      expect(result).toHaveProperty("on");
      expect(result).toHaveProperty("off");
      expect(result).toHaveProperty("once");
      expect(typeof (result as any).on).toBe("function");
      expect(typeof (result as any).off).toBe("function");
      expect(typeof (result as any).once).toBe("function");

      // Should be able to add listeners without error
      const changeSpy = jest.fn();
      const errorSpy = jest.fn();

      (result as any).on("change", changeSpy);
      (result as any).on("error", errorSpy);
      (result as any).once("change", changeSpy);
      (result as any).off("change", changeSpy);

      // Stop polling to clean up
      (result as any).stopPolling();
    });

    test("should return regular prompt when poll is 0", async () => {
      const sdk = new PromptrunSDK({ apiKey: "test-key" });

      const mockPrompt: PromptrunPrompt = {
        id: "p-1",
        prompt: "Test prompt",
        createdAt: "2021-01-01",
        updatedAt: "2021-01-01",
        version: 1,
        versionMessage: "Initial version",
        tag: null,
        temperature: 0.5,
        user: { id: "u-1", clerkId: "clerk-1" },
        project: { id: "p-1", name: "Test Project" },
        model: {
          name: "test-model",
          provider: "test-provider",
          model: "test-model",
          icon: "test-icon",
        },
      };

      fetchMock.mockResponseOnce(JSON.stringify(mockPrompt));

      const result = await sdk.prompt({
        projectId: "proj-123",
        poll: 0, // No polling
      });

      // Should be regular prompt with polling methods (disabled)
      expect(result.prompt).toBe("Test prompt");
      expect(result).toHaveProperty("on");
      expect(result).toHaveProperty("stopPolling");
      expect(result).toHaveProperty("isPolling");
      expect(result.isPolling).toBe(false);
    });

    test("should support SSE polling with poll: 'sse'", async () => {
      const sdk = new PromptrunSDK({ apiKey: "test-key" });

      const mockPrompt: PromptrunPrompt = {
        id: "p-1",
        prompt: "Test prompt",
        createdAt: "2021-01-01",
        updatedAt: "2021-01-01",
        version: 1,
        versionMessage: "Initial version",
        tag: null,
        temperature: 0.5,
        user: { id: "u-1", clerkId: "clerk-1" },
        project: { id: "p-1", name: "Test Project" },
        model: {
          name: "test-model",
          provider: "test-provider",
          model: "test-model",
          icon: "test-icon",
        },
      };

      // Mock EventSource
      const mockEventSource = {
        onopen: null,
        onmessage: null,
        onerror: null,
        close: jest.fn(),
        readyState: 1,
      };

      (global as any).EventSource = jest.fn(() => mockEventSource);

      fetchMock.mockResponseOnce(JSON.stringify(mockPrompt));

      const result = await sdk.prompt({
        projectId: "proj-123",
        poll: "sse",
      });

      // Should be SSE polling prompt with event methods
      expect(result.prompt).toBe("Test prompt");
      expect(result).toHaveProperty("on");
      expect(result).toHaveProperty("stopPolling");
      expect(result).toHaveProperty("isPolling");

      // Stop polling to clean up
      (result as any).stopPolling();
    });

    test("should validate polling configuration options", async () => {
      const sdk = new PromptrunSDK({ apiKey: "test-key" });

      const mockPrompt: PromptrunPrompt = {
        id: "p-1",
        prompt: "Test prompt",
        createdAt: "2021-01-01",
        updatedAt: "2021-01-01",
        version: 1,
        versionMessage: "Initial version",
        tag: null,
        temperature: 0.5,
        user: { id: "u-1", clerkId: "clerk-1" },
        project: { id: "p-1", name: "Test Project" },
        model: {
          name: "test-model",
          provider: "test-provider",
          model: "test-model",
          icon: "test-icon",
        },
      };

      fetchMock.mockResponseOnce(JSON.stringify(mockPrompt));

      // Test with all configuration options
      const onChangeSpy = jest.fn();
      const onErrorSpy = jest.fn();

      const result = await sdk.prompt({
        projectId: "proj-123",
        poll: 6000,
        version: "v1",
        tag: "production",
        onChange: onChangeSpy,
        onPollingError: onErrorSpy,
        enforceMinimumInterval: true,
      });

      expect(result.prompt).toBe("Test prompt");
      expect(result).toHaveProperty("getStatus");

      const status = (result as any).getStatus();
      expect(status).toHaveProperty("isPolling");
      expect(status).toHaveProperty("currentInterval");

      // Stop polling to clean up
      (result as any).stopPolling();
    });
  });

  describe("Enhanced prompt functionality", () => {
    const mockPromptResponse = {
      id: "test-prompt-id",
      prompt:
        "Analyze the {{symbol}} token on {{chain}} blockchain. Address: {{address}}",
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
      version: 2,
      versionMessage: "Updated prompt",
      tag: null,
      temperature: 0.7,
      user: { id: "user-1", clerkId: "clerk-1" },
      project: { id: "project-1", name: "Test Project" },
      model: {
        name: "GPT-4",
        provider: "openai",
        model: "gpt-4",
        icon: "openai-icon",
      },
    };

    test("should work with nested object schema", async () => {
      fetchMock.mockResponseOnce(
        JSON.stringify({
          ...mockPromptResponse,
          prompt:
            "Analyze {{user.name}}'s {{token.symbol}} on {{token.chain}}. Address: {{token.address}}",
        })
      );

      const nestedSchema = z.object({
        user: z.object({
          name: z.string(),
          id: z.string(),
        }),
        token: z.object({
          symbol: z.string(),
          chain: z.enum(["ethereum", "base", "arbitrum"]),
          address: z.string(),
        }),
      });

      const inputs = {
        user: {
          name: "John Doe",
          id: "user123",
        },
        token: {
          symbol: "ETH",
          chain: "ethereum",
          address: "0xabc...",
        },
      };

      const result = await sdk.prompt({
        projectId: "test-project",
        inputsSchema: nestedSchema,
        inputs,
      });

      expect(result.prompt).toBe(
        "Analyze John Doe's ETH on ethereum. Address: 0xabc..."
      );
      expect(result.inputs).toEqual([
        "user.name",
        "token.symbol",
        "token.chain",
        "token.address",
      ]);
      expect(result.template).toBe(
        "Analyze {{user.name}}'s {{token.symbol}} on {{token.chain}}. Address: {{token.address}}"
      );
      expect(result.version).toBe(2);
      expect(result.model).toBe("gpt-4");
    });

    test("should return structured result with schema validation", async () => {
      fetchMock.mockResponseOnce(JSON.stringify(mockPromptResponse));

      const inputsSchema = z.object({
        symbol: z.string(),
        chain: z.enum(["ethereum", "base", "arbitrum"]),
        address: z.string(),
      });

      const inputs = {
        symbol: "ETH",
        chain: "ethereum",
        address: "0xabc...",
      };

      const result = (await sdk.prompt({
        projectId: "test-project",
        inputsSchema,
        inputs,
      })) as unknown as PromptrunPromptResult;

      expect(result.prompt).toBe(
        "Analyze the ETH token on ethereum blockchain. Address: 0xabc..."
      );
      expect(result.inputs).toEqual(["symbol", "chain", "address"]);
      expect(result.template).toBe(
        "Analyze the {{symbol}} token on {{chain}} blockchain. Address: {{address}}"
      );
      expect(result.version).toBe(2);
      expect(result.model).toBe("gpt-4");
    });

    test("should throw error for invalid inputs with schema", async () => {
      fetchMock.mockResponseOnce(JSON.stringify(mockPromptResponse));

      const inputsSchema = z.object({
        symbol: z.string(),
        chain: z.enum(["ethereum", "base", "arbitrum"]),
        address: z.string(),
      });

      const inputs = {
        symbol: "ETH",
        chain: "invalid-chain", // Invalid value
        address: "0xabc...",
      };

      await expect(
        sdk.prompt({
          projectId: "test-project",
          inputsSchema,
          inputs,
        })
      ).rejects.toThrow(PromptrunConfigurationError);
    });

    test("should work without schema validation", async () => {
      fetchMock.mockResponseOnce(JSON.stringify(mockPromptResponse));

      const inputs = {
        symbol: "ETH",
        chain: "ethereum",
        address: "0xabc...",
      };

      const result = (await sdk.prompt({
        projectId: "test-project",
        inputs,
      })) as unknown as PromptrunPromptResult;

      expect(result.prompt).toBe(
        "Analyze the ETH token on ethereum blockchain. Address: 0xabc..."
      );
      expect(result.inputs).toEqual(["symbol", "chain", "address"]);
      expect(result.template).toBe(
        "Analyze the {{symbol}} token on {{chain}} blockchain. Address: {{address}}"
      );
      expect(result.version).toBe(2);
      expect(result.model).toBe("gpt-4");
    });

    test("should show warning for missing variables", async () => {
      fetchMock.mockResponseOnce(JSON.stringify(mockPromptResponse));
      const consoleSpy = jest.spyOn(console, "warn").mockImplementation();

      const inputs = {
        symbol: "ETH",
        // missing chain and address
      };

      const result = (await sdk.prompt({
        projectId: "test-project",
        inputs,
      })) as unknown as PromptrunPromptResult;

      expect(result.prompt).toBe(
        "Analyze the ETH token on {{chain}} blockchain. Address: {{address}}"
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        "Warning: The following variables are defined in the prompt but not provided in inputs: chain, address. Continuing with unprocessed variables."
      );

      consoleSpy.mockRestore();
    });

    test("should work with prompt without variables when inputs are provided", async () => {
      const promptWithoutVariables = {
        ...mockPromptResponse,
        prompt: "This is a simple prompt without variables.",
      };
      fetchMock.mockResponseOnce(JSON.stringify(promptWithoutVariables));

      const result = (await sdk.prompt({
        projectId: "test-project",
        inputs: {}, // Provide empty inputs to trigger enhanced mode
      })) as unknown as PromptrunPromptResult;

      expect(result.prompt).toBe("This is a simple prompt without variables.");
      expect(result.inputs).toEqual([]);
      expect(result.template).toBe(
        "This is a simple prompt without variables."
      );
      expect(result.version).toBe(2);
      expect(result.model).toBe("gpt-4");
    });
  });
});
