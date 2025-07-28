import { LanguageModelV1 } from "@ai-sdk/provider";
import { PromptrunLanguageModel } from "./promptrun-language-model";
import {
  PromptrunPollingPromptImpl,
  PromptrunSSEPromptImpl,
} from "./promptrun-polling-prompt";
import { parsePromptVariables } from "./stream-utils";
import {
  PromptrunAPIError,
  PromptrunAuthenticationError,
  PromptrunConnectionError,
  PromptrunLanguageModelOptions,
  PromptrunPollingPrompt,
  PromptrunPrompt,
  PromptrunPromptOptions,
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

  // Overload for when poll is 0 - returns regular prompt
  async prompt(
    options: PromptrunPromptOptions & { poll: 0 }
  ): Promise<PromptrunPrompt>;

  // Overload for when poll is a positive number - returns polling prompt
  async prompt(
    options: PromptrunPromptOptions & { poll: number }
  ): Promise<PromptrunPollingPrompt>;

  // Overload for when poll is 'sse' - returns polling prompt
  async prompt(
    options: PromptrunPromptOptions & { poll: "sse" }
  ): Promise<PromptrunPollingPrompt>;

  // Overload for when poll is undefined - returns polling prompt (default behavior)
  async prompt(
    options: Omit<PromptrunPromptOptions, "poll">
  ): Promise<PromptrunPollingPrompt>;

  // Implementation
  async prompt(
    options: PromptrunPromptOptions
  ): Promise<PromptrunPrompt | PromptrunPollingPrompt> {
    const {
      projectId,
      variables,
      poll = 6000, // Default to 6000ms polling when not specified
      version,
      tag,
      onPollingError,
      onChange,
      enforceMinimumInterval = true,
    } = options;

    // Fetch the prompt once
    const initialPrompt = await this.fetchPromptOnce(projectId, version, tag);

    // Process variables if provided
    if (variables) {
      initialPrompt.processedPrompt = parsePromptVariables(
        initialPrompt.prompt,
        variables
      );
    }

    // Handle polling logic
    if (poll === "sse") {
      // Use SSE for real-time updates
      return new PromptrunSSEPromptImpl(
        initialPrompt,
        this.options,
        projectId,
        version,
        tag,
        onChange
      );
    } else if (typeof poll === "number" && poll > 0) {
      // Use polling with specified interval
      return new PromptrunPollingPromptImpl(
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
    }

    return initialPrompt;
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
    const baseUrl = this.options.baseURL ?? "https://api.promptrun.ai/v1";

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

    const url = `${baseUrl}/prompt?${queryParams.toString()}`;

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
