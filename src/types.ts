import { z } from "zod";

/**
 * Defines configuration options for a specific language model instance,
 * primarily for controlling caching behavior.
 */
export interface PromptrunLanguageModelOptions {
  /**
   * Configures prompt caching for this model instance.
   * Provide a unique ID to enable caching.
   */
  cache?: {
    /** The unique identifier for the prompt cache. */
    id: string;
  };
}

/**
 * Defines the options for constructing the Promptrun SDK client.
 */
export interface PromptrunSDKOptions {
  apiKey: string;
  baseURL?: string;
  headers?: Record<string, string>;
}

/**
 * Event data when a prompt change is detected during polling
 */
export interface PromptrunPromptChangeEvent {
  /** The updated prompt data */
  prompt: PromptrunPrompt;
  /** The previous prompt data for comparison */
  previousPrompt: PromptrunPrompt;
  /** What changed (version, content, etc.) */
  changes: {
    version?: { from: number; to: number };
    content?: { from: string; to: string };
    temperature?: { from: number; to: number };
    tag?: { from: string | null; to: string | null };
    updatedAt?: { from: string; to: string };
  };
}

/**
 * Defines the input options for the `sdk.prompt()` method.
 */
export interface PromptrunPromptOptions {
  /** The ID of the project containing the prompt. */
  projectId: string;

  /**
   * Zod schema for validating input variables.
   * This schema defines the expected types and structure of the inputs.
   * Supports nested objects and complex validation rules.
   */
  inputsSchema?: z.ZodSchema<unknown>;

  /**
   * Input variables that match the inputsSchema.
   * These will be validated against the schema and used to replace variables in the prompt.
   */
  inputs?: Record<string, unknown>;

  /**
   * The polling interval in milliseconds for refetching the prompt.
   * - If omitted, uses default interval of 6000ms (6 seconds).
   * - If set to 0, the prompt will be fetched only once (no polling).
   * - If set to a positive number, uses that interval (minimum 5000ms enforced).
   * - If set to 'sse', uses Server-Sent Events for real-time updates.
   * @default 6000 (6 seconds polling)
   */
  poll?: number | "sse";

  /**
   * The version of the prompt to fetch (e.g., "v1", "v2").
   * If omitted, returns the latest version.
   */
  version?: string;

  /**
   * The tag of the prompt to fetch (e.g., "test", "production").
   * If omitted, fetches prompt without tag filtering.
   */
  tag?: string;

  /**
   * Optional callback to handle polling errors.
   * If not provided, errors will be logged to console.
   */
  onPollingError?: (error: PromptrunPollingError) => void;

  /**
   * Optional callback called when the prompt changes during polling.
   * This provides a simple way to react to prompt updates.
   */
  onChange?: (event: PromptrunPromptChangeEvent) => void;

  /**
   * Whether to enforce minimum polling intervals.
   * If false, allows aggressive polling intervals that may cause rate limiting.
   * @default true
   */
  enforceMinimumInterval?: boolean;
}

/**
 * Unified result object returned by the prompt() method
 * Properties are optional based on the method used (enhanced vs legacy)
 */
export interface PromptrunPromptResult {
  // Enhanced prompt properties
  /** The system prompt with processed variables, ready to be used */
  systemPrompt?: string;
  /** Array of variables defined from the playground */
  inputs?: string[];
  /** Raw system prompt without variables */
  template?: string;
  /** The model name associated with the prompt */
  model?: string;

  // Legacy prompt properties
  /** The prompt ID */
  id?: string;
  /** The raw prompt text */
  prompt?: string;
  /** Prompt version number */
  version?: number;
  /** Version message */
  versionMessage?: string;
  /** Prompt tag */
  tag?: string | null;
  /** Temperature setting */
  temperature?: number;
  /** User information */
  user?: {
    id: string;
    clerkId: string;
  };
  /** Project information */
  project?: {
    id: string;
    name: string;
  };
  /** Full model information */
  modelInfo?: {
    name: string;
    provider: string;
    model: string;
    icon: string;
  };
  /** Creation timestamp */
  createdAt?: string;
  /** Last update timestamp */
  updatedAt?: string;

  // Polling properties
  /** Whether polling is currently active */
  isPolling?: boolean;
  /** Gets the current prompt data */
  getCurrent?: () => unknown;
  /** Stops the polling for this prompt */
  stopPolling?: () => void;
  /** Gets the current polling status */
  getStatus?: () => unknown;
  /** Sets an error handler for polling errors */
  onError?: (handler: (error: unknown) => void) => void;
  /** Removes the error handler */
  removeErrorHandler?: () => void;
  /** Adds a listener for prompt change events */
  on?: unknown;
  /** Removes a listener for prompt change events */
  off?: unknown;
  /** Adds a one-time listener for prompt change events */
  once?: unknown;
}

/**
 * Represents the current status of a polling prompt.
 */
export interface PromptrunPollingStatus {
  /** Whether polling is currently active */
  isPolling: boolean;
  /** Current polling interval in milliseconds */
  currentInterval: number;
  /** Number of consecutive errors */
  consecutiveErrors: number;
  /** Current backoff multiplier being applied */
  backoffMultiplier: number;
  /** Last error that occurred, if any */
  lastError?: PromptrunPollingError;
  /** Timestamp of last successful fetch */
  lastSuccessfulFetch?: Date;
  /** Timestamp of last error */
  lastErrorTime?: Date;
}

/**
 * A polling prompt instance that provides access to the current prompt data
 * and allows stopping the polling.
 */
export interface PromptrunPollingPrompt extends PromptrunPrompt {
  /**
   * Gets the current prompt data. This will be updated as polling occurs.
   * @returns The latest prompt data
   */
  getCurrent(): PromptrunPrompt;

  /**
   * Stops the polling for this prompt.
   */
  stopPolling(): void;

  /**
   * Whether polling is currently active.
   */
  readonly isPolling: boolean;

  /**
   * Gets the current polling status including error information.
   */
  getStatus(): PromptrunPollingStatus;

  /**
   * Sets an error handler for polling errors.
   * @param handler Function to handle polling errors
   */
  onError(handler: (error: PromptrunPollingError) => void): void;

  /**
   * Removes the error handler.
   */
  removeErrorHandler(): void;

  /**
   * Adds a listener for prompt change events.
   * @param event The event type to listen for
   * @param handler Function to handle the event
   */
  on(
    event: "change",
    handler: (event: PromptrunPromptChangeEvent) => void
  ): void;
  on(event: "error", handler: (error: PromptrunPollingError) => void): void;

  /**
   * Removes a listener for prompt change events.
   * @param event The event type to remove listener for
   * @param handler The specific handler to remove (optional)
   */
  off(
    event: "change",
    handler?: (event: PromptrunPromptChangeEvent) => void
  ): void;
  off(event: "error", handler?: (error: PromptrunPollingError) => void): void;

  /**
   * Adds a one-time listener for prompt change events.
   * @param event The event type to listen for
   * @param handler Function to handle the event (called once)
   */
  once(
    event: "change",
    handler: (event: PromptrunPromptChangeEvent) => void
  ): void;
  once(event: "error", handler: (error: PromptrunPollingError) => void): void;
}

/**
 * Defines the expected shape of the successful response from the
 * GET /prompts/{projectId} API endpoint.
 */
export interface PromptrunPrompt {
  id: string;
  createdAt: string;
  updatedAt: string;
  prompt: string;
  /** The processed prompt with variables replaced */
  processedPrompt?: string;
  version: number;
  versionMessage: string;
  tag: string | null;
  temperature: number;
  user: {
    id: string;
    clerkId: string;
  };
  project: {
    id: string;
    name: string;
  };
  model: {
    name: string;
    provider: string;
    model: string;
    icon: string;
  };
}

/**
 * The base error class for all errors thrown by the PromptRun SDK.
 * Catching this error allows you to handle any SDK-specific issue.
 */
export class PromptrunError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PromptrunError";
  }
}

/**
 * Represents an error that occurred during an API call, such as an
 * invalid request or a server-side issue.
 */
export class PromptrunAPIError extends PromptrunError {
  /** The HTTP status code of the failed API response. */
  readonly status?: number;
  /** The headers of the failed API response. */
  readonly headers?: Record<string, string>;

  constructor(
    message: string,
    options?: { status?: number; headers?: Record<string, string> }
  ) {
    super(message);
    this.name = "PromptrunAPIError";
    this.status = options?.status;
    this.headers = options?.headers;
  }
}

/**
 * Represents an authentication error (HTTP 401 Unauthorized), which typically
 * means the provided API key is invalid or missing.
 */
export class PromptrunAuthenticationError extends PromptrunAPIError {
  constructor(
    message: string,
    options?: { status?: number; headers?: Record<string, string> }
  ) {
    super(message, options);
    this.name = "PromptrunAuthenticationError";
  }
}

/**
 * Represents a connection error that occurred when the SDK failed to
 * communicate with the PromptRun API, often due to network issues.
 */
export class PromptrunConnectionError extends PromptrunError {
  constructor(message: string) {
    super(message);
    this.name = "PromptrunConnectionError";
  }
}

/**
 * Represents a configuration error, such as invalid polling intervals
 * or other SDK configuration issues.
 */
export class PromptrunConfigurationError extends PromptrunError {
  /** The configuration parameter that caused the error */
  readonly parameter: string;
  /** The invalid value that was provided */
  readonly providedValue: unknown;
  /** The expected or minimum value */
  readonly expectedValue?: number | string | boolean;

  constructor(
    message: string,
    options: {
      parameter: string;
      providedValue: unknown;
      expectedValue?: number | string | boolean;
    }
  ) {
    super(message);
    this.name = "PromptrunConfigurationError";
    this.parameter = options.parameter;
    this.providedValue = options.providedValue;
    this.expectedValue = options.expectedValue;
  }
}

/**
 * Represents an error that occurred during polling operations.
 */
export class PromptrunPollingError extends PromptrunError {
  /** The type of polling error */
  readonly type:
    | "rate_limit"
    | "authentication"
    | "network"
    | "api"
    | "configuration"
    | "unknown";
  /** The underlying error that caused this polling error */
  readonly cause?: Error;
  /** The project ID this error occurred for */
  readonly projectId: string;
  /** Number of consecutive errors when this occurred */
  readonly consecutiveErrors: number;
  /** Current backoff multiplier when this occurred */
  readonly backoffMultiplier: number;
  /** HTTP status code if applicable */
  readonly statusCode?: number;

  constructor(
    message: string,
    options: {
      type:
        | "rate_limit"
        | "authentication"
        | "network"
        | "api"
        | "configuration"
        | "unknown";
      cause?: Error;
      projectId: string;
      consecutiveErrors: number;
      backoffMultiplier: number;
      statusCode?: number;
    }
  ) {
    super(message);
    this.name = "PromptrunPollingError";
    this.type = options.type;
    this.cause = options.cause;
    this.projectId = options.projectId;
    this.consecutiveErrors = options.consecutiveErrors;
    this.backoffMultiplier = options.backoffMultiplier;
    this.statusCode = options.statusCode;
  }
}

/**
 * Event map for typing the event emitter
 */
export interface EventMap extends Record<string, unknown[]> {
  change: [PromptrunPromptChangeEvent];
  error: [PromptrunPollingError];
}

/**
 * Type-safe event emitter for handling polling events
 */
export class PollingEventEmitter<
  T extends Record<string, unknown[]> = EventMap
> {
  private listeners: Map<keyof T, Set<(...args: T[keyof T]) => void>> =
    new Map();

  on<K extends keyof T>(event: K, handler: (...args: T[K]) => void): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    const handlers = this.listeners.get(event);
    if (handlers) {
      handlers.add(handler as (...args: T[keyof T]) => void);
    }
  }

  off<K extends keyof T>(event: K, handler?: (...args: T[K]) => void): void {
    const handlers = this.listeners.get(event);
    if (!handlers) {
      return;
    }

    if (handler) {
      handlers.delete(handler as (...args: T[keyof T]) => void);
    } else {
      handlers.clear();
    }
  }

  once<K extends keyof T>(event: K, handler: (...args: T[K]) => void): void {
    const onceHandler = (...args: T[K]) => {
      handler(...args);
      this.off(event, onceHandler);
    };
    this.on(event, onceHandler);
  }

  emit<K extends keyof T>(event: K, ...args: T[K]): void {
    const handlers = this.listeners.get(event);
    if (!handlers) {
      return;
    }

    handlers.forEach((handler) => {
      try {
        handler(...(args as T[keyof T]));
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error(`Error in event handler for '${String(event)}':`, error);
      }
    });
  }
}
