import {
  EventMap,
  PollingEventEmitter,
  PromptrunAPIError,
  PromptrunAuthenticationError,
  PromptrunConfigurationError,
  PromptrunConnectionError,
  PromptrunPollingError,
  PromptrunPollingPrompt,
  PromptrunPollingStatus,
  PromptrunPrompt,
  PromptrunPromptChangeEvent,
  PromptrunSDKOptions,
} from "./types";

/**
 * Implementation of a polling prompt that keeps the prompt data up-to-date
 * by periodically fetching from the Promptrun server.
 *
 * This class provides automatic polling functionality with intelligent backoff
 * strategies, error handling, and event emission for prompt changes. It implements
 * the `PromptrunPollingPrompt` interface and can be used to maintain real-time
 * synchronization with prompt updates on the server.
 *
 * Features:
 * - Automatic polling at specified intervals
 * - Intelligent backoff on errors (exponential backoff for rate limits)
 * - Event emission for prompt changes and errors
 * - Minimum interval enforcement to prevent rate limiting
 * - Comprehensive error handling and recovery
 *
 * @implements {PromptrunPollingPrompt}
 * @since 1.0.0
 *
 * @example
 * ```typescript
 * const prompt = await promptrun.prompt({
 *   projectId: "your-project-id",
 *   poll: 5000, // Poll every 5 seconds
 *   onChange: (event) => {
 *     console.log("Prompt updated:", event.changes);
 *   },
 *   onPollingError: (error) => {
 *     console.error("Polling error:", error.message);
 *   }
 * });
 *
 * // Access current prompt data
 * console.log(prompt.prompt);
 * console.log(prompt.version);
 *
 * // Control polling
 * prompt.stopPolling();
 *
 * // Listen for events
 * prompt.on("change", (event) => {
 *   console.log("Prompt changed:", event.changes);
 * });
 *
 * prompt.on("error", (error) => {
 *   console.error("Polling error:", error);
 * });
 * ```
 */
export class PromptrunPollingPromptImpl implements PromptrunPollingPrompt {
  /** @private Current prompt data */
  private currentPrompt: PromptrunPrompt;

  /** @private Active polling interval timer */
  private pollingInterval: NodeJS.Timeout | null = null;

  /** @private SDK configuration options */
  private readonly sdkOptions: PromptrunSDKOptions;

  /** @private Project ID being polled */
  private readonly projectId: string;

  /** @private Optional version parameter */
  private readonly versionParam?: string;

  /** @private Optional tag parameter */
  private readonly tagParam?: string;

  /** @private Polling interval in milliseconds */
  private readonly pollIntervalMs: number;

  /** @private Current backoff multiplier for error handling */
  private backoffMultiplier: number = 1;

  /** @private Number of consecutive errors */
  private consecutiveErrors: number = 0;

  /** @private Maximum backoff time (5 minutes) */
  private readonly maxBackoffMs: number = 300000;

  /** @private Minimum polling interval (5 seconds) */
  private readonly minPollIntervalMs: number = 5000;

  /** @private Error handler callback */
  private errorHandler?: (error: PromptrunPollingError) => void;

  /** @private Last error that occurred */
  private lastError?: PromptrunPollingError;

  /** @private Timestamp of last successful fetch */
  private lastSuccessfulFetch?: Date;

  /** @private Timestamp of last error */
  private lastErrorTime?: Date;

  /** @private Event emitter for change and error events */
  private readonly eventEmitter = new PollingEventEmitter<EventMap>();

  /** @private Change callback function */
  private readonly onChangeCallback?: (
    event: PromptrunPromptChangeEvent
  ) => void;

  /**
   * Creates a new PromptrunPollingPromptImpl instance.
   *
   * @param {PromptrunPrompt} initialPrompt - The initial prompt data
   * @param {PromptrunSDKOptions} sdkOptions - SDK configuration options
   * @param {string} projectId - The project ID to poll
   * @param {number} pollIntervalMs - Polling interval in milliseconds
   * @param {string} [version] - Optional version to poll
   * @param {string} [tag] - Optional tag to poll
   * @param {(error: PromptrunPollingError) => void} [onPollingError] - Error handler callback
   * @param {boolean} [enforceMinimumInterval=true] - Whether to enforce minimum polling interval
   * @param {(event: PromptrunPromptChangeEvent) => void} [onChange] - Change event callback
   *
   * @throws {PromptrunConfigurationError} When polling interval is too aggressive and enforceMinimumInterval is true
   */
  constructor(
    initialPrompt: PromptrunPrompt,
    sdkOptions: PromptrunSDKOptions,
    projectId: string,
    pollIntervalMs: number,
    version?: string,
    tag?: string,
    onPollingError?: (error: PromptrunPollingError) => void,
    enforceMinimumInterval: boolean = true,
    onChange?: (event: PromptrunPromptChangeEvent) => void
  ) {
    this.currentPrompt = initialPrompt;
    this.sdkOptions = sdkOptions;
    this.projectId = projectId;
    this.versionParam = version;
    this.tagParam = tag;
    this.errorHandler = onPollingError;
    this.onChangeCallback = onChange;
    this.lastSuccessfulFetch = new Date(); // Initial fetch was successful

    // Handle minimum polling interval enforcement
    if (enforceMinimumInterval && pollIntervalMs < this.minPollIntervalMs) {
      throw new PromptrunConfigurationError(
        `Polling interval ${pollIntervalMs}ms is too aggressive and may cause rate limiting. ` +
          `Minimum allowed interval is ${this.minPollIntervalMs}ms (5 seconds). ` +
          `Use enforceMinimumInterval: false to bypass this check.`,
        {
          parameter: "poll",
          providedValue: pollIntervalMs,
          expectedValue: this.minPollIntervalMs,
        }
      );
    }

    // Use provided interval or enforce minimum
    this.pollIntervalMs = enforceMinimumInterval
      ? Math.max(pollIntervalMs, this.minPollIntervalMs)
      : pollIntervalMs;

    // Start polling
    this.startPolling();
  }

  // Implement PromptrunPrompt interface by delegating to current prompt
  get id(): string {
    return this.currentPrompt.id;
  }

  get createdAt(): string {
    return this.currentPrompt.createdAt;
  }

  get updatedAt(): string {
    return this.currentPrompt.updatedAt;
  }

  get prompt(): string {
    return this.currentPrompt.prompt;
  }

  get inputs(): string[] | undefined {
    return this.currentPrompt.inputs;
  }

  get processedPrompt(): string | undefined {
    return this.currentPrompt.processedPrompt;
  }

  get version(): number {
    return this.currentPrompt.version;
  }

  get versionMessage(): string {
    return this.currentPrompt.versionMessage;
  }

  get tag(): string | null {
    return this.currentPrompt.tag;
  }

  get temperature(): number {
    return this.currentPrompt.temperature;
  }

  get user(): { id: string; clerkId: string } {
    return this.currentPrompt.user;
  }

  get project(): { id: string; name: string } {
    return this.currentPrompt.project;
  }

  get model(): {
    name: string;
    provider: string;
    model: string;
    icon: string;
  } {
    return this.currentPrompt.model;
  }

  /**
   * Gets the current prompt data.
   *
   * Returns a copy of the current prompt data. This method is useful for
   * getting the latest prompt data without directly accessing the properties.
   *
   * @returns {PromptrunPrompt} A copy of the current prompt data
   *
   * @example
   * ```typescript
   * const currentPrompt = prompt.getCurrent();
   * console.log(currentPrompt.prompt);
   * console.log(currentPrompt.version);
   * ```
   */
  getCurrent(): PromptrunPrompt {
    return { ...this.currentPrompt };
  }

  /**
   * Stops the polling for this prompt.
   *
   * This method clears the active polling interval and stops any further
   * automatic updates. The prompt will retain its last fetched data but
   * will no longer receive updates from the server.
   *
   * @example
   * ```typescript
   * prompt.stopPolling();
   * console.log(prompt.isPolling); // false
   * ```
   */
  stopPolling(): void {
    if (this.pollingInterval) {
      clearTimeout(this.pollingInterval);
      this.pollingInterval = null;
    }
  }

  /**
   * Whether polling is currently active.
   *
   * @returns {boolean} True if polling is active, false otherwise
   */
  get isPolling(): boolean {
    return this.pollingInterval !== null;
  }

  /**
   * Gets the current polling status including error information.
   *
   * This method returns comprehensive status information about the polling
   * process, including whether it's active, current interval, error counts,
   * and timing information.
   *
   * @returns {PromptrunPollingStatus} Current polling status
   *
   * @example
   * ```typescript
   * const status = prompt.getStatus();
   * console.log("Is polling:", status.isPolling);
   * console.log("Current interval:", status.currentInterval);
   * console.log("Consecutive errors:", status.consecutiveErrors);
   * console.log("Backoff multiplier:", status.backoffMultiplier);
   * ```
   */
  getStatus(): PromptrunPollingStatus {
    return {
      isPolling: this.isPolling,
      currentInterval: this.pollIntervalMs * this.backoffMultiplier,
      consecutiveErrors: this.consecutiveErrors,
      backoffMultiplier: this.backoffMultiplier,
      lastError: this.lastError,
      lastSuccessfulFetch: this.lastSuccessfulFetch,
      lastErrorTime: this.lastErrorTime,
    };
  }

  /**
   * Sets an error handler for polling errors.
   *
   * @param {(error: PromptrunPollingError) => void} handler - Function to handle polling errors
   *
   * @example
   * ```typescript
   * prompt.onError((error) => {
   *   console.error("Polling error:", error.message);
   *   console.error("Error type:", error.type);
   *   console.error("Consecutive errors:", error.consecutiveErrors);
   * });
   * ```
   */
  onError(handler: (error: PromptrunPollingError) => void): void {
    this.errorHandler = handler;
  }

  /**
   * Removes the error handler.
   *
   * @example
   * ```typescript
   * prompt.removeErrorHandler();
   * // Errors will now be logged to console by default
   * ```
   */
  removeErrorHandler(): void {
    this.errorHandler = undefined;
  }

  // Event emitter methods - match interface overloads exactly
  /**
   * Adds a listener for prompt change events.
   *
   * @param {"change"} event - The event type to listen for
   * @param {(event: PromptrunPromptChangeEvent) => void} handler - Function to handle the event
   */
  on(
    event: "change",
    handler: (event: PromptrunPromptChangeEvent) => void
  ): void;
  /**
   * Adds a listener for polling error events.
   *
   * @param {"error"} event - The event type to listen for
   * @param {(error: PromptrunPollingError) => void} handler - Function to handle the event
   */
  on(event: "error", handler: (error: PromptrunPollingError) => void): void;
  on(
    event: "change" | "error",
    handler:
      | ((event: PromptrunPromptChangeEvent) => void)
      | ((error: PromptrunPollingError) => void)
  ): void {
    if (event === "change") {
      this.eventEmitter.on(
        "change",
        handler as (event: PromptrunPromptChangeEvent) => void
      );
    } else {
      this.eventEmitter.on(
        "error",
        handler as (error: PromptrunPollingError) => void
      );
    }
  }

  /**
   * Removes a listener for prompt change events.
   *
   * @param {"change"} event - The event type to remove listener for
   * @param {(event: PromptrunPromptChangeEvent) => void} [handler] - The specific handler to remove (optional)
   */
  off(
    event: "change",
    handler?: (event: PromptrunPromptChangeEvent) => void
  ): void;
  /**
   * Removes a listener for polling error events.
   *
   * @param {"error"} event - The event type to remove listener for
   * @param {(error: PromptrunPollingError) => void} [handler] - The specific handler to remove (optional)
   */
  off(event: "error", handler?: (error: PromptrunPollingError) => void): void;
  off(
    event: "change" | "error",
    handler?:
      | ((event: PromptrunPromptChangeEvent) => void)
      | ((error: PromptrunPollingError) => void)
  ): void {
    if (event === "change") {
      this.eventEmitter.off(
        "change",
        handler as ((event: PromptrunPromptChangeEvent) => void) | undefined
      );
    } else {
      this.eventEmitter.off(
        "error",
        handler as ((error: PromptrunPollingError) => void) | undefined
      );
    }
  }

  /**
   * Adds a one-time listener for prompt change events.
   *
   * @param {"change"} event - The event type to listen for
   * @param {(event: PromptrunPromptChangeEvent) => void} handler - Function to handle the event (called once)
   */
  once(
    event: "change",
    handler: (event: PromptrunPromptChangeEvent) => void
  ): void;
  /**
   * Adds a one-time listener for polling error events.
   *
   * @param {"error"} event - The event type to listen for
   * @param {(error: PromptrunPollingError) => void} handler - Function to handle the event (called once)
   */
  once(event: "error", handler: (error: PromptrunPollingError) => void): void;
  once(
    event: "change" | "error",
    handler:
      | ((event: PromptrunPromptChangeEvent) => void)
      | ((error: PromptrunPollingError) => void)
  ): void {
    if (event === "change") {
      this.eventEmitter.once(
        "change",
        handler as (event: PromptrunPromptChangeEvent) => void
      );
    } else {
      this.eventEmitter.once(
        "error",
        handler as (error: PromptrunPollingError) => void
      );
    }
  }

  /**
   * Starts the polling process.
   *
   * @private
   */
  private startPolling(): void {
    this.scheduleNextPoll();
  }

  /**
   * Schedules the next poll with appropriate backoff.
   *
   * @private
   */
  private scheduleNextPoll(): void {
    if (this.pollingInterval) {
      clearTimeout(this.pollingInterval);
    }

    const currentInterval = this.pollIntervalMs * this.backoffMultiplier;
    const actualInterval = Math.min(currentInterval, this.maxBackoffMs);

    this.pollingInterval = setTimeout(async () => {
      try {
        const updatedPrompt = await this.fetchPrompt();
        const hasChanged = this.detectChanges(
          this.currentPrompt,
          updatedPrompt
        );

        if (hasChanged) {
          const changeEvent = this.createChangeEvent(
            this.currentPrompt,
            updatedPrompt
          );
          this.currentPrompt = updatedPrompt;

          // Emit change event
          this.eventEmitter.emit("change", changeEvent);

          // Call onChange callback if provided
          if (this.onChangeCallback) {
            try {
              this.onChangeCallback(changeEvent);
            } catch (error) {
              // eslint-disable-next-line no-console
              console.error("Error in onChange callback:", error);
            }
          }
        } else {
          // Update current prompt even if no major changes detected
          this.currentPrompt = updatedPrompt;
        }

        // Reset backoff on success
        this.backoffMultiplier = 1;
        this.consecutiveErrors = 0;
        this.lastError = undefined;
        this.lastSuccessfulFetch = new Date();

        // Schedule next poll
        this.scheduleNextPoll();
      } catch (error) {
        this.handlePollingError(error);
      }
    }, actualInterval);
  }

  /**
   * Detects if there are meaningful changes between two prompts.
   *
   * @private
   * @param {PromptrunPrompt} current - The current prompt data
   * @param {PromptrunPrompt} updated - The updated prompt data
   * @returns {boolean} True if meaningful changes are detected
   */
  private detectChanges(
    current: PromptrunPrompt,
    updated: PromptrunPrompt
  ): boolean {
    return (
      current.version !== updated.version ||
      current.prompt !== updated.prompt ||
      current.temperature !== updated.temperature ||
      current.tag !== updated.tag ||
      current.updatedAt !== updated.updatedAt
    );
  }

  /**
   * Creates a change event object with details about what changed.
   *
   * @private
   * @param {PromptrunPrompt} previous - The previous prompt data
   * @param {PromptrunPrompt} current - The current prompt data
   * @returns {PromptrunPromptChangeEvent} Change event with details about what changed
   */
  private createChangeEvent(
    previous: PromptrunPrompt,
    current: PromptrunPrompt
  ): PromptrunPromptChangeEvent {
    const changes: PromptrunPromptChangeEvent["changes"] = {};

    if (previous.version !== current.version) {
      changes.version = { from: previous.version, to: current.version };
    }

    if (previous.prompt !== current.prompt) {
      changes.content = { from: previous.prompt, to: current.prompt };
    }

    if (previous.temperature !== current.temperature) {
      changes.temperature = {
        from: previous.temperature,
        to: current.temperature,
      };
    }

    if (previous.tag !== current.tag) {
      changes.tag = { from: previous.tag, to: current.tag };
    }

    if (previous.updatedAt !== current.updatedAt) {
      changes.updatedAt = { from: previous.updatedAt, to: current.updatedAt };
    }

    return {
      prompt: current,
      previousPrompt: previous,
      changes,
    };
  }

  /**
   * Handles polling errors with appropriate backoff strategies.
   *
   * @private
   * @param {unknown} error - The error that occurred
   */
  private handlePollingError(error: unknown): void {
    this.consecutiveErrors++;
    this.lastErrorTime = new Date();

    // Create a proper PromptrunPollingError
    const pollingError = this.createPollingError(error);
    this.lastError = pollingError;

    // Emit error event
    this.eventEmitter.emit("error", pollingError);

    // Handle different error types with appropriate backoff
    if (pollingError.type === "rate_limit") {
      this.backoffMultiplier = Math.min(this.backoffMultiplier * 2, 16); // Max 16x backoff
    } else if (this.consecutiveErrors >= 3) {
      // For other errors, use modest backoff after 3 consecutive failures
      this.backoffMultiplier = Math.min(this.backoffMultiplier * 1.5, 4); // Max 4x backoff
    }

    // Call error handler if provided, otherwise log to console
    if (this.errorHandler) {
      try {
        this.errorHandler(pollingError);
      } catch (handlerError) {
        // eslint-disable-next-line no-console
        console.error(`Error in polling error handler:`, handlerError);
        this.logDefaultError(pollingError);
      }
    } else {
      this.logDefaultError(pollingError);
    }

    // Schedule next poll with backoff
    this.scheduleNextPoll();
  }

  /**
   * Creates a PromptrunPollingError from various error types.
   *
   * @private
   * @param {unknown} error - The original error
   * @returns {PromptrunPollingError} A properly formatted polling error
   */
  private createPollingError(error: unknown): PromptrunPollingError {
    let type: PromptrunPollingError["type"] = "unknown";
    let message = `Polling error for project ${this.projectId}`;
    let statusCode: number | undefined;
    let cause: Error | undefined;

    if (error instanceof PromptrunAPIError) {
      if (error.status === 429) {
        type = "rate_limit";
        message = `Rate limited while polling project ${this.projectId}. Too many requests.`;
      } else if (error.status === 401) {
        type = "authentication";
        message = `Authentication failed while polling project ${this.projectId}.`;
      } else {
        type = "api";
        message = `API error while polling project ${this.projectId}: ${error.message}`;
      }
      statusCode = error.status;
      cause = error;
    } else if (error instanceof PromptrunAuthenticationError) {
      type = "authentication";
      message = `Authentication failed while polling project ${this.projectId}.`;
      statusCode = error.status;
      cause = error;
    } else if (error instanceof PromptrunConnectionError) {
      type = "network";
      message = `Network error while polling project ${this.projectId}: ${error.message}`;
      cause = error;
    } else if (error instanceof Error) {
      message = `Unknown error while polling project ${this.projectId}: ${error.message}`;
      cause = error;
    }

    return new PromptrunPollingError(message, {
      type,
      cause,
      projectId: this.projectId,
      consecutiveErrors: this.consecutiveErrors,
      backoffMultiplier: this.backoffMultiplier,
      statusCode,
    });
  }

  /**
   * Logs default error messages to console when no error handler is provided.
   *
   * @private
   * @param {PromptrunPollingError} pollingError - The polling error to log
   */
  private logDefaultError(pollingError: PromptrunPollingError): void {
    if (pollingError.type === "rate_limit") {
      // eslint-disable-next-line no-console
      console.warn(
        `Rate limited (429) for project ${this.projectId}. ` +
          `Backing off to ${
            (this.pollIntervalMs * this.backoffMultiplier) / 1000
          }s interval.`
      );
    } else if (this.consecutiveErrors >= 3) {
      // eslint-disable-next-line no-console
      console.warn(
        `Multiple polling errors for project ${this.projectId}. ` +
          `Slowing down to ${
            (this.pollIntervalMs * this.backoffMultiplier) / 1000
          }s interval. ` +
          `Error: ${pollingError.message}`
      );
    } else {
      // eslint-disable-next-line no-console
      console.warn(
        `Polling error for project ${this.projectId}:`,
        pollingError
      );
    }
  }

  /**
   * Fetches a prompt from the Promptrun API.
   *
   * @private
   * @returns {Promise<PromptrunPrompt>} Promise that resolves to the prompt data
   * @throws {PromptrunAuthenticationError} When API authentication fails
   * @throws {PromptrunAPIError} When API returns an error
   * @throws {PromptrunConnectionError} When network communication fails
   */
  private async fetchPrompt(): Promise<PromptrunPrompt> {
    // Build query parameters
    const queryParams = new URLSearchParams({
      projectId: this.projectId,
    });

    if (this.versionParam) {
      queryParams.append("version", this.versionParam);
    }

    if (this.tagParam) {
      queryParams.append("tag", this.tagParam);
    }

    const url = `${this.sdkOptions.baseURL}/prompt?${queryParams.toString()}`;

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          ...this.sdkOptions.headers,
          Authorization: `Bearer ${this.sdkOptions.apiKey}`,
        },
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new PromptrunAuthenticationError(
            "Authentication failed for fetching prompt."
          );
        }
        if (response.status === 429) {
          throw new PromptrunAPIError(
            `Rate limited while fetching prompt. Too many requests.`,
            { status: response.status }
          );
        }
        throw new PromptrunAPIError(
          `Failed to fetch prompt with status: ${response.status}`,
          { status: response.status }
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

/**
 * SSE-based prompt implementation for real-time updates.
 *
 * This class provides real-time prompt updates using Server-Sent Events (SSE).
 * Unlike polling, SSE maintains a persistent connection to the server and
 * receives updates as they happen, providing true real-time synchronization.
 *
 * Features:
 * - Real-time updates via Server-Sent Events
 * - Automatic reconnection on connection loss
 * - Event emission for prompt changes and errors
 * - Same interface as polling prompts for consistency
 *
 * @implements {PromptrunPollingPrompt}
 * @since 1.0.0
 *
 * @example
 * ```typescript
 * const prompt = await promptrun.prompt({
 *   projectId: "your-project-id",
 *   poll: "sse", // Use SSE for real-time updates
 *   onChange: (event) => {
 *     console.log("Real-time update:", event.changes);
 *   }
 * });
 *
 * // SSE prompts work the same as polling prompts
 * console.log(prompt.prompt);
 * prompt.stopPolling(); // Closes the SSE connection
 * ```
 */
export class PromptrunSSEPromptImpl implements PromptrunPollingPrompt {
  /** @private Current prompt data */
  private currentPrompt: PromptrunPrompt;

  /** @private Active EventSource connection */
  private eventSource: EventSource | null = null;

  /** @private SDK configuration options */
  private readonly sdkOptions: PromptrunSDKOptions;

  /** @private Project ID being monitored */
  private readonly projectId: string;

  /** @private Optional version parameter */
  private readonly versionParam?: string;

  /** @private Optional tag parameter */
  private readonly tagParam?: string;

  /** @private Event emitter for change and error events */
  private readonly eventEmitter = new PollingEventEmitter<EventMap>();

  /** @private Change callback function */
  private readonly onChangeCallback?: (
    event: PromptrunPromptChangeEvent
  ) => void;

  /** @private Last error that occurred */
  private lastError?: PromptrunPollingError;

  /** @private Timestamp of last successful fetch */
  private lastSuccessfulFetch?: Date;

  /** @private Timestamp of last error */
  private lastErrorTime?: Date;

  /** @private Whether the SSE connection is currently active */
  private isConnected: boolean = false;

  /**
   * Creates a new PromptrunSSEPromptImpl instance.
   *
   * @param {PromptrunPrompt} initialPrompt - The initial prompt data
   * @param {PromptrunSDKOptions} sdkOptions - SDK configuration options
   * @param {string} projectId - The project ID to monitor
   * @param {string} [version] - Optional version to monitor
   * @param {string} [tag] - Optional tag to monitor
   * @param {(event: PromptrunPromptChangeEvent) => void} [onChange] - Change event callback
   */
  constructor(
    initialPrompt: PromptrunPrompt,
    sdkOptions: PromptrunSDKOptions,
    projectId: string,
    version?: string,
    tag?: string,
    onChange?: (event: PromptrunPromptChangeEvent) => void
  ) {
    this.currentPrompt = initialPrompt;
    this.sdkOptions = sdkOptions;
    this.projectId = projectId;
    this.versionParam = version;
    this.tagParam = tag;
    this.onChangeCallback = onChange;
    this.lastSuccessfulFetch = new Date();

    this.setupSSE();
  }

  // Implement PromptrunPrompt interface by delegating to current prompt
  get id(): string {
    return this.currentPrompt.id;
  }

  get createdAt(): string {
    return this.currentPrompt.createdAt;
  }

  get updatedAt(): string {
    return this.currentPrompt.updatedAt;
  }

  get prompt(): string {
    return this.currentPrompt.prompt;
  }

  get inputs(): string[] | undefined {
    return this.currentPrompt.inputs;
  }

  get processedPrompt(): string | undefined {
    return this.currentPrompt.processedPrompt;
  }

  get version(): number {
    return this.currentPrompt.version;
  }

  get versionMessage(): string {
    return this.currentPrompt.versionMessage;
  }

  get tag(): string | null {
    return this.currentPrompt.tag;
  }

  get temperature(): number {
    return this.currentPrompt.temperature;
  }

  get user(): { id: string; clerkId: string } {
    return this.currentPrompt.user;
  }

  get project(): { id: string; name: string } {
    return this.currentPrompt.project;
  }

  get model(): {
    name: string;
    provider: string;
    model: string;
    icon: string;
  } {
    return this.currentPrompt.model;
  }

  /**
   * Gets the current prompt data.
   *
   * @returns {PromptrunPrompt} A copy of the current prompt data
   */
  getCurrent(): PromptrunPrompt {
    return { ...this.currentPrompt };
  }

  /**
   * Stops the SSE connection.
   *
   * This method closes the EventSource connection and stops receiving
   * real-time updates. The prompt will retain its last received data.
   */
  stopPolling(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
      this.isConnected = false;
    }
  }

  /**
   * Whether the SSE connection is currently active.
   *
   * @returns {boolean} True if SSE connection is active, false otherwise
   */
  get isPolling(): boolean {
    return this.isConnected;
  }

  /**
   * Gets the current SSE status.
   *
   * @returns {PromptrunPollingStatus} Current SSE status (note: interval is always 0 for SSE)
   */
  getStatus(): PromptrunPollingStatus {
    return {
      isPolling: this.isConnected,
      currentInterval: 0, // SSE doesn't use intervals
      consecutiveErrors: 0,
      backoffMultiplier: 1,
      lastError: this.lastError,
      lastSuccessfulFetch: this.lastSuccessfulFetch,
      lastErrorTime: this.lastErrorTime,
    };
  }

  /**
   * Sets an error handler for SSE errors.
   *
   * @param {(error: PromptrunPollingError) => void} handler - Function to handle SSE errors
   */
  onError(handler: (error: PromptrunPollingError) => void): void {
    this.eventEmitter.on("error", handler);
  }

  /**
   * Removes the error handler.
   */
  removeErrorHandler(): void {
    this.eventEmitter.off("error");
  }

  /**
   * Adds a listener for prompt change events.
   *
   * @param {"change"} event - The event type to listen for
   * @param {(event: PromptrunPromptChangeEvent) => void} handler - Function to handle the event
   */
  on(
    event: "change",
    handler: (event: PromptrunPromptChangeEvent) => void
  ): void;
  /**
   * Adds a listener for SSE error events.
   *
   * @param {"error"} event - The event type to listen for
   * @param {(error: PromptrunPollingError) => void} handler - Function to handle the event
   */
  on(event: "error", handler: (error: PromptrunPollingError) => void): void;
  on(
    event: "change" | "error",
    handler:
      | ((event: PromptrunPromptChangeEvent) => void)
      | ((error: PromptrunPollingError) => void)
  ): void {
    if (event === "change") {
      this.eventEmitter.on(
        "change",
        handler as (event: PromptrunPromptChangeEvent) => void
      );
    } else {
      this.eventEmitter.on(
        "error",
        handler as (error: PromptrunPollingError) => void
      );
    }
  }

  /**
   * Removes a listener for prompt change events.
   *
   * @param {"change"} event - The event type to remove listener for
   * @param {(event: PromptrunPromptChangeEvent) => void} [handler] - The specific handler to remove (optional)
   */
  off(
    event: "change",
    handler?: (event: PromptrunPromptChangeEvent) => void
  ): void;
  /**
   * Removes a listener for SSE error events.
   *
   * @param {"error"} event - The event type to remove listener for
   * @param {(error: PromptrunPollingError) => void} [handler] - The specific handler to remove (optional)
   */
  off(event: "error", handler?: (error: PromptrunPollingError) => void): void;
  off(
    event: "change" | "error",
    handler?:
      | ((event: PromptrunPromptChangeEvent) => void)
      | ((error: PromptrunPollingError) => void)
  ): void {
    if (event === "change") {
      this.eventEmitter.off(
        "change",
        handler as ((event: PromptrunPromptChangeEvent) => void) | undefined
      );
    } else {
      this.eventEmitter.off(
        "error",
        handler as ((error: PromptrunPollingError) => void) | undefined
      );
    }
  }

  /**
   * Adds a one-time listener for prompt change events.
   *
   * @param {"change"} event - The event type to listen for
   * @param {(event: PromptrunPromptChangeEvent) => void} handler - Function to handle the event (called once)
   */
  once(
    event: "change",
    handler: (event: PromptrunPromptChangeEvent) => void
  ): void;
  /**
   * Adds a one-time listener for SSE error events.
   *
   * @param {"error"} event - The event type to listen for
   * @param {(error: PromptrunPollingError) => void} handler - Function to handle the event (called once)
   */
  once(event: "error", handler: (error: PromptrunPollingError) => void): void;
  once(
    event: "change" | "error",
    handler:
      | ((event: PromptrunPromptChangeEvent) => void)
      | ((error: PromptrunPollingError) => void)
  ): void {
    if (event === "change") {
      this.eventEmitter.once(
        "change",
        handler as (event: PromptrunPromptChangeEvent) => void
      );
    } else {
      this.eventEmitter.once(
        "error",
        handler as (error: PromptrunPollingError) => void
      );
    }
  }

  /**
   * Sets up the Server-Sent Events connection.
   *
   * @private
   */
  private setupSSE(): void {
    // Build query parameters
    const queryParams = new URLSearchParams({
      projectId: this.projectId,
    });

    if (this.versionParam) {
      queryParams.append("version", this.versionParam);
    }

    if (this.tagParam) {
      queryParams.append("tag", this.tagParam);
    }

    const url = `${
      this.sdkOptions.baseURL
    }/prompt/stream?${queryParams.toString()}`;

    try {
      // Note: EventSource constructor doesn't accept headers in standard browsers
      // This is a Node.js specific implementation or polyfill that supports headers
      this.eventSource = new EventSource(url, {
        headers: {
          Authorization: `Bearer ${this.sdkOptions.apiKey}`,
          ...this.sdkOptions.headers,
        },
      } as EventSourceInit & { headers?: Record<string, string> });

      this.eventSource.onopen = () => {
        this.isConnected = true;
        this.lastSuccessfulFetch = new Date();
        this.lastError = undefined;
      };

      this.eventSource.onmessage = (event) => {
        try {
          const updatedPrompt: PromptrunPrompt = JSON.parse(event.data);
          const hasChanged = this.detectChanges(
            this.currentPrompt,
            updatedPrompt
          );

          if (hasChanged) {
            const changeEvent = this.createChangeEvent(
              this.currentPrompt,
              updatedPrompt
            );
            this.currentPrompt = updatedPrompt;

            // Emit change event
            this.eventEmitter.emit("change", changeEvent);

            // Call onChange callback if provided
            if (this.onChangeCallback) {
              try {
                this.onChangeCallback(changeEvent);
              } catch (error) {
                // eslint-disable-next-line no-console
                console.error("Error in onChange callback:", error);
              }
            }
          } else {
            this.currentPrompt = updatedPrompt;
          }

          this.lastSuccessfulFetch = new Date();
        } catch (error) {
          this.handleSSEError(
            new Error(`Failed to parse SSE message: ${error}`)
          );
        }
      };

      this.eventSource.onerror = (_event) => {
        this.isConnected = false;
        this.handleSSEError(new Error("SSE connection error"));

        // Attempt to reconnect after a delay
        setTimeout(() => {
          if (
            !this.eventSource ||
            this.eventSource.readyState === EventSource.CLOSED
          ) {
            this.setupSSE();
          }
        }, 5000);
      };
    } catch (error) {
      this.handleSSEError(error as Error);
    }
  }

  /**
   * Detects if there are meaningful changes between two prompts.
   *
   * @private
   * @param {PromptrunPrompt} current - The current prompt data
   * @param {PromptrunPrompt} updated - The updated prompt data
   * @returns {boolean} True if meaningful changes are detected
   */
  private detectChanges(
    current: PromptrunPrompt,
    updated: PromptrunPrompt
  ): boolean {
    return (
      current.version !== updated.version ||
      current.prompt !== updated.prompt ||
      current.temperature !== updated.temperature ||
      current.tag !== updated.tag ||
      current.updatedAt !== updated.updatedAt
    );
  }

  /**
   * Creates a change event object with details about what changed.
   *
   * @private
   * @param {PromptrunPrompt} previous - The previous prompt data
   * @param {PromptrunPrompt} current - The current prompt data
   * @returns {PromptrunPromptChangeEvent} Change event with details about what changed
   */
  private createChangeEvent(
    previous: PromptrunPrompt,
    current: PromptrunPrompt
  ): PromptrunPromptChangeEvent {
    const changes: PromptrunPromptChangeEvent["changes"] = {};

    if (previous.version !== current.version) {
      changes.version = { from: previous.version, to: current.version };
    }

    if (previous.prompt !== current.prompt) {
      changes.content = { from: previous.prompt, to: current.prompt };
    }

    if (previous.temperature !== current.temperature) {
      changes.temperature = {
        from: previous.temperature,
        to: current.temperature,
      };
    }

    if (previous.tag !== current.tag) {
      changes.tag = { from: previous.tag, to: current.tag };
    }

    if (previous.updatedAt !== current.updatedAt) {
      changes.updatedAt = { from: previous.updatedAt, to: current.updatedAt };
    }

    return {
      prompt: current,
      previousPrompt: previous,
      changes,
    };
  }

  /**
   * Handles SSE errors and emits error events.
   *
   * @private
   * @param {Error} error - The error that occurred
   */
  private handleSSEError(error: Error): void {
    this.lastErrorTime = new Date();

    const pollingError = new PromptrunPollingError(
      `SSE error for project ${this.projectId}: ${error.message}`,
      {
        type: "network",
        cause: error,
        projectId: this.projectId,
        consecutiveErrors: 1,
        backoffMultiplier: 1,
      }
    );

    this.lastError = pollingError;
    this.eventEmitter.emit("error", pollingError);
  }
}
