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
 * The main client for interacting with the Promptrun AI platform.
 */
export class PromptrunSDK {
  private readonly options: PromptrunSDKOptions;

  constructor(options: PromptrunSDKOptions | string) {
    if (typeof options === "string") {
      this.options = { apiKey: options };
    } else {
      this.options = options;
    }
  }

  /**
   * Creates a new language model instance that can be used with the Vercel AI SDK.
   *
   * @param {string} modelId The ID of the model to use, e.g., "openai/gpt-4o".
   * @param {PromptrunLanguageModelOptions} [options] Optional configuration for the model
   * instance, such as caching behavior.
   * @returns {LanguageModelV1} An object that implements the `LanguageModelV1` interface.
   */
  model(
    modelId: string,
    options?: PromptrunLanguageModelOptions
  ): LanguageModelV1 {
    return new PromptrunLanguageModel(modelId, this.options, options);
  }

  /**
   * Fetches a prompt template from the PromptRun server.
   *
   * If no polling interval is specified, fetches the prompt once and returns it.
   * If a polling interval is provided, returns a polling prompt that automatically updates.
   * If poll is set to 'sse', uses Server-Sent Events for real-time updates.
   *
   * @param {PromptrunPromptOptions} options The parameters for fetching the prompt.
   * @returns {Promise<PromptrunPrompt | PromptrunPollingPrompt>} A promise that resolves to the prompt data or a polling prompt.
   */

  // Unified implementation
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

    // Enhanced functionality: Use enhanced processing when inputsSchema or inputs are provided
    if (inputsSchema || inputs) {
      // Extract variables from the prompt template
      const extractedVariables = extractPromptVariables(initialPrompt.prompt);

      // Process the prompt with inputs (validation if schema provided)
      let processedInputs: Record<string, unknown> = inputs || {};
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
   * Stops all active polling intervals. Useful for cleanup during testing
   * or when shutting down the application.
   * @deprecated This method is no longer needed. Use stopPolling() on individual polling prompts instead.
   */
  stopAllPolling(): void {
    // This method is kept for backward compatibility but no longer does anything
    // since polling is now managed by individual PromptrunPollingPrompt instances
  }

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

    const baseURL = this.options.baseURL || "https://api.promptrun.ai/v1";
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
