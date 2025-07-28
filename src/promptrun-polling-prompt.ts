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
 * by periodically fetching from the server.
 */
export class PromptrunPollingPromptImpl implements PromptrunPollingPrompt {
  private currentPrompt: PromptrunPrompt;
  private pollingInterval: NodeJS.Timeout | null = null;
  private readonly sdkOptions: PromptrunSDKOptions;
  private readonly projectId: string;
  private readonly versionParam?: string;
  private readonly tagParam?: string;
  private readonly pollIntervalMs: number;
  private backoffMultiplier: number = 1;
  private consecutiveErrors: number = 0;
  private readonly maxBackoffMs: number = 300000; // 5 minutes max backoff
  private readonly minPollIntervalMs: number = 5000; // Minimum 5 seconds to prevent rate limits
  private errorHandler?: (error: PromptrunPollingError) => void;
  private lastError?: PromptrunPollingError;
  private lastSuccessfulFetch?: Date;
  private lastErrorTime?: Date;
  private readonly eventEmitter = new PollingEventEmitter<EventMap>();
  private readonly onChangeCallback?: (
    event: PromptrunPromptChangeEvent
  ) => void;

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

  // Implement PromptrunPollingPrompt interface
  getCurrent(): PromptrunPrompt {
    return { ...this.currentPrompt };
  }

  stopPolling(): void {
    if (this.pollingInterval) {
      clearTimeout(this.pollingInterval);
      this.pollingInterval = null;
    }
  }

  get isPolling(): boolean {
    return this.pollingInterval !== null;
  }

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

  onError(handler: (error: PromptrunPollingError) => void): void {
    this.errorHandler = handler;
  }

  removeErrorHandler(): void {
    this.errorHandler = undefined;
  }

  // Event emitter methods - match interface overloads exactly
  on(
    event: "change",
    handler: (event: PromptrunPromptChangeEvent) => void
  ): void;
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

  off(
    event: "change",
    handler?: (event: PromptrunPromptChangeEvent) => void
  ): void;
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

  once(
    event: "change",
    handler: (event: PromptrunPromptChangeEvent) => void
  ): void;
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

  private startPolling(): void {
    this.scheduleNextPoll();
  }

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
   * Detects if there are meaningful changes between two prompts
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
   * Creates a change event object with details about what changed
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

  private async fetchPrompt(): Promise<PromptrunPrompt> {
    const baseUrl = this.sdkOptions.baseURL ?? "https://api.promptrun.ai/v1";

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

    const url = `${baseUrl}/prompt?${queryParams.toString()}`;

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
 * SSE-based prompt implementation for real-time updates
 */
export class PromptrunSSEPromptImpl implements PromptrunPollingPrompt {
  private currentPrompt: PromptrunPrompt;
  private eventSource: EventSource | null = null;
  private readonly sdkOptions: PromptrunSDKOptions;
  private readonly projectId: string;
  private readonly versionParam?: string;
  private readonly tagParam?: string;
  private readonly eventEmitter = new PollingEventEmitter<EventMap>();
  private readonly onChangeCallback?: (
    event: PromptrunPromptChangeEvent
  ) => void;
  private lastError?: PromptrunPollingError;
  private lastSuccessfulFetch?: Date;
  private lastErrorTime?: Date;
  private isConnected: boolean = false;

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

  getCurrent(): PromptrunPrompt {
    return { ...this.currentPrompt };
  }

  stopPolling(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
      this.isConnected = false;
    }
  }

  get isPolling(): boolean {
    return this.isConnected;
  }

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

  onError(handler: (error: PromptrunPollingError) => void): void {
    this.eventEmitter.on("error", handler);
  }

  removeErrorHandler(): void {
    this.eventEmitter.off("error");
  }

  on(
    event: "change",
    handler: (event: PromptrunPromptChangeEvent) => void
  ): void;
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

  off(
    event: "change",
    handler?: (event: PromptrunPromptChangeEvent) => void
  ): void;
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

  once(
    event: "change",
    handler: (event: PromptrunPromptChangeEvent) => void
  ): void;
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

  private setupSSE(): void {
    const baseUrl = this.sdkOptions.baseURL ?? "https://api.promptrun.ai/v1";

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

    const url = `${baseUrl}/prompt/stream?${queryParams.toString()}`;

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
