import { LanguageModelV1 } from "@ai-sdk/provider";
import { PromptrunLanguageModel } from "./promptrun-language-model";
import {
  PromptrunPollingPromptImpl,
  PromptrunSSEPromptImpl,
} from "./promptrun-polling-prompt";
import {
  extractPromptVariables,
  processPromptWithInputs,
  validateInputs,
} from "./stream-utils";
import {
  PromptrunAPIError,
  PromptrunAuthenticationError,
  PromptrunConfigurationError,
  PromptrunConnectionError,
  PromptrunLanguageModelOptions,
  PromptrunPrompt,
  PromptrunPromptOptions,
  PromptrunPromptResult,
  PromptrunSDKOptions,
} from "./types";

/**
 * Main client for interacting with the Promptrun AI platform.
 *
 * The PromptrunSDK provides a unified interface for:
 * - Creating language model instances compatible with Vercel AI SDK
 * - Fetching and managing dynamic prompts from the Promptrun server
 * - Supporting both one-time and real-time prompt updates via polling or SSE
 * - Input validation and variable processing for prompts
 *
 * @example
 * ```typescript
 * // Initialize with API key string
 * const promptrun = new PromptrunSDK("your-api-key");
 *
 * // Initialize with options object
 * const promptrun = new PromptrunSDK({
 *   apiKey: "your-api-key",
 *   baseURL: "https://your-api-endpoint.com/v1",
 *   headers: { "Custom-Header": "value" }
 * });
 *
 * // Create a language model
 * const model = promptrun.model("openai/gpt-4o");
 *
 * // Fetch a prompt
 * const prompt = await promptrun.prompt({
 *   projectId: "your-project-id",
 *   poll: 5000 // Poll every 5 seconds
 * });
 * ```
 *
 * @class PromptrunSDK
 * @since 1.0.0
 */
export class PromptrunSDK {
  /** @private Internal SDK configuration options */
  private readonly options: PromptrunSDKOptions;

  /**
   * Creates a new PromptrunSDK instance.
   *
   * The constructor supports two initialization patterns:
   * 1. **String API Key**: Pass the API key as a string, baseURL will be read from environment variable
   * 2. **Options Object**: Pass a configuration object with apiKey, baseURL, and optional headers
   *
   * The baseURL can be provided in three ways (in order of precedence):
   * 1. Environment variable `PROMPTRUN_BASE_URL`
   * 2. `baseURL` property in the options object
   * 3. No fallback - the SDK will throw an error if no baseURL is configured
   *
   * @param {PromptrunSDKOptions | string} options - Configuration options or API key string
   * @throws {PromptrunConfigurationError} When baseURL is missing or invalid
   *
   * @example
   * ```typescript
   * // String constructor (uses environment variable for baseURL)
   * const sdk = new PromptrunSDK("your-api-key");
   *
   * // Options constructor
   * const sdk = new PromptrunSDK({
   *   apiKey: "your-api-key",
   *   baseURL: "https://your-api-endpoint.com/v1",
   *   headers: { "X-Custom-Header": "value" }
   * });
   * ```
   */
  constructor(options: PromptrunSDKOptions | string) {
    if (typeof options === "string") {
      // String constructor - use environment variable for baseURL
      const envBaseURL = process.env.PROMPTRUN_BASE_URL;
      this.options = {
        apiKey: options,
        baseURL:
          envBaseURL && envBaseURL.trim() !== "" ? envBaseURL : undefined,
      };
    } else {
      // Options constructor - prioritize environment variable over provided baseURL
      const envBaseURL = process.env.PROMPTRUN_BASE_URL;
      const baseURL =
        envBaseURL && envBaseURL.trim() !== "" ? envBaseURL : options.baseURL;

      this.options = {
        ...options,
        baseURL,
      };
    }

    // Validate baseURL is properly configured
    this.validateBaseURL();
  }

  /**
   * Validates that the baseURL is properly configured and has a valid format.
   *
   * This method is called during SDK initialization to ensure:
   * - A baseURL is provided (either via environment variable or options)
   * - The baseURL is a valid URL format
   *
   * @private
   * @throws {PromptrunConfigurationError} When baseURL is missing or invalid
   */
  private validateBaseURL(): void {
    const baseURL = this.options.baseURL;

    if (!baseURL) {
      throw new PromptrunConfigurationError(
        "baseURL is required but not configured. Please set the baseURL in your SDK options or ensure it's provided via environment variables during build.",
        {
          parameter: "baseURL",
          providedValue: undefined,
          expectedValue: "A valid URL string",
        }
      );
    }

    // Validate that baseURL is a valid URL
    try {
      new URL(baseURL);
    } catch {
      throw new PromptrunConfigurationError(
        `Invalid baseURL format: ${baseURL}. Please provide a valid URL.`,
        {
          parameter: "baseURL",
          providedValue: baseURL,
          expectedValue: "A valid URL string",
        }
      );
    }
  }

  /**
   * Creates a new language model instance that can be used with the Vercel AI SDK.
   *
   * This method returns a `LanguageModelV1` compatible object that can be used
   * with Vercel AI SDK's `generateText` and `streamText` functions. The model
   * supports prompt caching and handles API communication with the Promptrun backend.
   *
   * @param {string} modelId - The ID of the model to use (e.g., "openai/gpt-4o", "anthropic/claude-3-sonnet")
   * @param {PromptrunLanguageModelOptions} [options] - Optional configuration for the model instance
   * @returns {LanguageModelV1} A language model instance compatible with Vercel AI SDK
   *
   * @example
   * ```typescript
   * const model = promptrun.model("openai/gpt-4o");
   *
   * // With caching options
   * const model = promptrun.model("openai/gpt-4o", {
   *   cache: { id: "unique-cache-id" }
   * });
   *
   * // Use with Vercel AI SDK
   * import { generateText } from 'ai';
   *
   * const { text } = await generateText({
   *   model,
   *   prompt: "Tell me a joke"
   * });
   * ```
   */
  model(
    modelId: string,
    options?: PromptrunLanguageModelOptions
  ): LanguageModelV1 {
    return new PromptrunLanguageModel(modelId, this.options, options);
  }

  /**
   * Fetches a prompt template from the Promptrun server with advanced features.
   *
   * This method provides a unified interface for fetching prompts with support for:
   * - **One-time fetching**: Get a prompt once (default behavior)
   * - **Polling**: Automatically refetch prompts at specified intervals
   * - **Server-Sent Events (SSE)**: Real-time prompt updates
   * - **Input validation**: Validate inputs against Zod schemas
   * - **Variable processing**: Replace variables in prompts with provided inputs
   * - **Enhanced mode**: Process prompts with inputs and return structured results
   *
   * The method returns a `PromptrunPromptResult` that provides both the processed
   * prompt data and polling control methods when applicable.
   *
   * @param {PromptrunPromptOptions} options - Configuration for fetching the prompt
   * @returns {Promise<PromptrunPromptResult>} Promise that resolves to prompt data or polling prompt
   *
   * @throws {PromptrunConfigurationError} When input validation fails
   * @throws {PromptrunAuthenticationError} When API authentication fails
   * @throws {PromptrunAPIError} When API returns an error
   * @throws {PromptrunConnectionError} When network communication fails
   *
   * @example
   * ```typescript
   * // Basic prompt fetching
   * const prompt = await promptrun.prompt({
   *   projectId: "your-project-id"
   * });
   *
   * // With polling
   * const prompt = await promptrun.prompt({
   *   projectId: "your-project-id",
   *   poll: 5000, // Poll every 5 seconds
   *   onChange: (event) => console.log("Prompt updated:", event.changes)
   * });
   *
   * // With input validation and processing
   * const prompt = await promptrun.prompt({
   *   projectId: "your-project-id",
   *   inputsSchema: z.object({
   *     name: z.string(),
   *     age: z.number()
   *   }),
   *   inputs: { name: "John", age: 30 }
   * });
   *
   * // With SSE for real-time updates
   * const prompt = await promptrun.prompt({
   *   projectId: "your-project-id",
   *   poll: "sse"
   * });
   * ```
   */
  async prompt(
    options: PromptrunPromptOptions
  ): Promise<PromptrunPromptResult> {
    const {
      projectId,
      inputsSchema,
      inputs,
      poll = 0, // Default to 0 (no polling) when not specified
      version,
      tag,
      onPollingError,
      onChange,
      enforceMinimumInterval = true,
    } = options;

    // Fetch the prompt once
    const initialPrompt = await this.fetchPromptOnce(projectId, version, tag);

    // Extract variables from the prompt template in any case
    const extractedVariables = extractPromptVariables(initialPrompt.prompt);

    // Set the inputs field on the initial prompt
    initialPrompt.inputs = extractedVariables;

    // Enhanced functionality: Use enhanced processing when inputsSchema or inputs are provided
    if (inputsSchema || inputs) {
      // Process the prompt with inputs (validation if schema provided)
      let processedInputs: Record<string, unknown> = {};
      if (inputs) {
        processedInputs = inputs;
      }

      if (inputsSchema && inputs) {
        try {
          processedInputs = validateInputs(inputs, inputsSchema) as Record<
            string,
            unknown
          >;
        } catch (error) {
          throw new PromptrunConfigurationError(
            `Input validation failed: ${
              error instanceof Error ? error.message : "Unknown error"
            }`,
            {
              parameter: "inputs",
              providedValue: inputs,
              expectedValue: "Valid input matching the provided schema",
            }
          );
        }
      }

      const systemPrompt = processPromptWithInputs(
        initialPrompt.prompt,
        processedInputs,
        extractedVariables
      );

      // Return enhanced result as PromptrunPromptResult
      return {
        prompt: systemPrompt,
        inputs: extractedVariables,
        template: initialPrompt.prompt,
        version: initialPrompt.version,
        model: initialPrompt.model.model,
        // Include all other properties for consistency
        id: initialPrompt.id,
        versionMessage: initialPrompt.versionMessage,
        tag: initialPrompt.tag,
        temperature: initialPrompt.temperature,
        user: initialPrompt.user,
        project: initialPrompt.project,
        modelInfo: initialPrompt.model,
        createdAt: initialPrompt.createdAt,
        updatedAt: initialPrompt.updatedAt,
        // Polling properties (disabled for enhanced prompts)
        isPolling: false,
        getCurrent: () => initialPrompt,
        stopPolling: () => {},
        getStatus: () => ({
          isPolling: false,
          currentInterval: 0,
          consecutiveErrors: 0,
          backoffMultiplier: 1,
        }),
        onError: () => {},
        removeErrorHandler: () => {},
        on: () => {},
        off: () => {},
        once: () => {},
      };
    }

    // Handle polling logic for legacy behavior
    if (poll === "sse") {
      // Use SSE for real-time updates
      const ssePrompt = new PromptrunSSEPromptImpl(
        initialPrompt,
        this.options,
        projectId,
        version,
        tag,
        onChange
      );

      // Return the SSE prompt as PromptrunPromptResult
      return ssePrompt as unknown as PromptrunPromptResult;
    } else if (typeof poll === "number" && poll > 0) {
      // Use polling with specified interval
      const pollingPrompt = new PromptrunPollingPromptImpl(
        initialPrompt,
        this.options,
        projectId,
        poll,
        version,
        tag,
        onPollingError,
        enforceMinimumInterval,
        onChange
      );

      // Return the polling prompt as PromptrunPromptResult
      return pollingPrompt as unknown as PromptrunPromptResult;
    }

    // Return the original prompt object as PromptrunPromptResult (when poll: 0)
    return {
      id: initialPrompt.id,
      prompt: initialPrompt.prompt,
      template: initialPrompt.prompt,
      inputs: extractedVariables,
      version: initialPrompt.version,
      versionMessage: initialPrompt.versionMessage,
      tag: initialPrompt.tag,
      temperature: initialPrompt.temperature,
      user: initialPrompt.user,
      project: initialPrompt.project,
      modelInfo: initialPrompt.model,
      createdAt: initialPrompt.createdAt,
      updatedAt: initialPrompt.updatedAt,
      // Polling properties (disabled when poll: 0)
      isPolling: false,
      getCurrent: () => initialPrompt,
      stopPolling: () => {},
      getStatus: () => ({
        isPolling: false,
        currentInterval: 0,
        consecutiveErrors: 0,
        backoffMultiplier: 1,
      }),
      onError: () => {},
      removeErrorHandler: () => {},
      on: () => {},
      off: () => {},
      once: () => {},
    };
  }

  /**
   * Stops all active polling intervals.
   *
   * @deprecated This method is deprecated and no longer needed. Use `stopPolling()`
   * on individual polling prompts instead. This method is kept for backward
   * compatibility but no longer performs any action.
   *
   * @example
   * ```typescript
   * // Instead of this (deprecated):
   * promptrun.stopAllPolling();
   *
   * // Use this:
   * const prompt = await promptrun.prompt({
   *   projectId: "your-project-id",
   *   poll: 5000
   * });
   * prompt.stopPolling();
   * ```
   */
  stopAllPolling(): void {
    // This method is kept for backward compatibility but no longer does anything
    // since polling is now managed by individual PromptrunPollingPrompt instances
  }

  /**
   * Fetches a prompt from the Promptrun server once.
   *
   * This private method handles the HTTP request to fetch a prompt from the
   * Promptrun API. It builds the appropriate query parameters and handles
   * authentication and error responses.
   *
   * @private
   * @param {string} projectId - The ID of the project containing the prompt
   * @param {string} [version] - Optional version of the prompt to fetch
   * @param {string} [tag] - Optional tag of the prompt to fetch
   * @returns {Promise<PromptrunPrompt>} Promise that resolves to the prompt data
   * @throws {PromptrunAuthenticationError} When API authentication fails
   * @throws {PromptrunAPIError} When API returns an error
   * @throws {PromptrunConnectionError} When network communication fails
   */
  private async fetchPromptOnce(
    projectId: string,
    version?: string,
    tag?: string
  ): Promise<PromptrunPrompt> {
    // Build query parameters
    const queryParams = new URLSearchParams({
      projectId: projectId,
    });

    if (version) {
      queryParams.append("version", version);
    }

    if (tag) {
      queryParams.append("tag", tag);
    }

    const baseURL = this.options.baseURL || "https://your-api-endpoint.com/v1";
    const url = `${baseURL}/prompt?${queryParams.toString()}`;

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          ...this.options.headers,
          Authorization: `Bearer ${this.options.apiKey}`,
        },
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new PromptrunAuthenticationError(
            "Authentication failed for fetching prompt."
          );
        }
        throw new PromptrunAPIError(
          `Failed to fetch prompt with status: ${response.status}`
        );
      }

      return await response.json();
    } catch (error) {
      if (error instanceof PromptrunAPIError) {
        throw error;
      }
      if (error instanceof PromptrunAuthenticationError) {
        throw error;
      }
      throw new PromptrunConnectionError(
        `Network error while fetching prompt: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }
}
