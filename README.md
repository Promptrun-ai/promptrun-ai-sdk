# Promptrun AI SDK

[![NPM Version](https://img.shields.io/npm/v/@promptrun-ai/sdk.svg)](https://www.npmjs.com/package/@promptrun-ai/sdk)
[![NPM Downloads](https://img.shields.io/npm/dm/@promptrun-ai/sdk.svg)](https://www.npmjs.com/package/@promptrun-ai/sdk)
![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)
![CodeRabbit Pull Request Reviews](https://img.shields.io/coderabbit/prs/github/Promptrun-ai/promptrun-ai-sdk?utm_source=oss&utm_medium=github&utm_campaign=Promptrun-ai%2Fpromptrun-ai-sdk&labelColor=171717&color=FF570A&link=https%3A%2F%2Fcoderabbit.ai&label=CodeRabbit+Reviews)
[![Build Status](https://img.shields.io/github/actions/workflow/status/Promptrun-ai/promptrun-ai-sdk/main.yml?branch=main)](https://github.com/Promptrun-ai/promptrun-ai-sdk/actions)

The official Promptrun AI SDK for Node.js provides dynamic prompt management and versioning for your AI applications. Manage your prompts through the Promptrun dashboard and integrate seamlessly with any LLM provider through the **Vercel AI SDK**.

Transform your AI applications with centralized prompt management, real-time updates, version control, and performance optimization - all without code deployments.

## Key Features

- **Dynamic Prompt Management**: Fetch and manage prompt templates from your Promptrun dashboard with real-time updates and version control
- **Real-time Updates**: Event-driven architecture with polling and Server-Sent Events (SSE) for instant prompt updates without redeployment
- **Version Control & Tagging**: Support for prompt versioning, tagging, and rollback capabilities for different environments
- **Prompt Variables**: Dynamic variable replacement with `{{variable_name}}` syntax for personalized prompts
- **Seamless LLM Integration**: Use prompts directly with `generateText`, `streamText`, and other Vercel AI SDK helpers
- **Performance Caching**: Built-in caching for prompts and completions to reduce latency and costs
- **Robust Error Handling**: Comprehensive error classes for building resilient applications
- **Streaming First**: Full support for streaming responses for interactive experiences
- **Fully Typed**: Written in TypeScript for excellent autocompletion and type safety

## Installation

You can install the SDK using npm, yarn, or pnpm.

```bash
npm install @promptrun-ai/sdk
```

```bash
yarn add @promptrun-ai/sdk
```

```bash
pnpm add @promptrun-ai/sdk
```

## Quick Start

Get started with dynamic prompt management in 3 simple steps:

```typescript
import { PromptrunSDK } from "@promptrun-ai/sdk";
import { generateText } from "ai";

// 1. Initialize the SDK
const promptrun = new PromptrunSDK({
  apiKey: process.env.PROMPTRUN_API_KEY!,
});

// 2. Fetch your prompt from the dashboard
const promptData = await promptrun.prompt({
  projectId: "YOUR_PROJECT_ID",
  poll: 30000, // Auto-update every 30 seconds*
});

// 3. Use with any LLM model
const model = promptrun.model(promptData.model.model);
const { text } = await generateText({
  model,
  messages: [
    { role: "system", content: promptData.prompt },
    { role: "user", content: "Hello!" }
  ]
});

console.log(text);
```

*Note: The `poll` parameter is optional and only necessary if you want automatic updates. For one-time prompt fetching, you can omit it or set `poll: 0`.

## Prompt Management

The core of Promptrun is dynamic prompt management. Instead of hardcoding prompts in your application, manage them through your Promptrun dashboard and fetch them dynamically with real-time updates.

### Fetching Prompts

Fetch prompts from your Promptrun project with version control and automatic model configuration:

```typescript
import { PromptrunSDK } from "@promptrun-ai/sdk";

const promptrun = new PromptrunSDK({
  apiKey: process.env.PROMPTRUN_API_KEY!,
});

// Fetch a prompt template from your project (one-time fetch)
const promptData = await promptrun.prompt({
  projectId: "YOUR_PROJECT_ID",
  poll: 0, // Disable polling for one-time fetch
});

console.log(`Using prompt version: ${promptData.version}`);
console.log(`Prompt content: ${promptData.prompt}`);
console.log(`Configured model: ${promptData.model.model}`);
```

### Version and Tag Support

Manage different versions of your prompts for different environments:

```typescript
// Fetch a specific version
const promptData = await promptrun.prompt({
  projectId: "YOUR_PROJECT_ID",
  version: "v2",
  poll: 0,
});

// Fetch a tagged version (e.g., "production", "staging")
const productionPrompt = await promptrun.prompt({
  projectId: "YOUR_PROJECT_ID",
  tag: "production",
  poll: 0,
});
```

### Prompt Variables

Use dynamic variables in your prompts with `{{variable_name}}` syntax:

```typescript
// Your prompt template: "Hello {{name}}, welcome to {{platform}}!"

const promptData = await promptrun.prompt({
  projectId: "your-project-id",
  variables: {
    name: "John Doe",
    platform: "Promptrun",
  },
});

console.log(promptData.prompt); // "Hello {{name}}, welcome to {{platform}}!"
console.log(promptData.processedPrompt); // "Hello John Doe, welcome to Promptrun!"
```

#### Variable Features

- **Simple replacement**: Variables in `{{variable_name}}` format are replaced with corresponding values
- **Missing variables**: If a variable is not provided, the original placeholder is preserved
- **Type conversion**: All variable values are converted to strings
- **Multiple occurrences**: The same variable can be used multiple times in a prompt

```typescript
const promptData = await promptrun.prompt({
  projectId: "your-project-id",
  variables: {
    name: "John Doe",
    // 'age' is not provided
  },
});

// If prompt is: "Hello {{name}}, your age is {{age}}"
console.log(promptData.processedPrompt); // "Hello John Doe, your age is {{age}}"
```

### Real-time Updates

Enable automatic prompt updates without redeploying your application using polling or Server-Sent Events.

#### Event-Driven Polling

When you enable polling, you get a `PromptrunPollingPrompt` with event capabilities for real-time updates:

```typescript
import { PromptrunSDK } from "@promptrun-ai/sdk";

const promptrun = new PromptrunSDK({
  apiKey: process.env.PROMPTRUN_API_KEY!,
});

// Enable polling (checks for updates every 30 seconds)
const pollingPrompt = await promptrun.prompt({
  projectId: "YOUR_PROJECT_ID",
  poll: 30000, // Poll every 30 seconds
  onChange: (changeEvent) => {
    console.log("Prompt updated!", {
      newVersion: changeEvent.prompt.version,
      changes: changeEvent.changes,
      previousVersion: changeEvent.previousPrompt.version,
    });

    // Handle specific types of changes
    if (changeEvent.changes.content) {
      console.log("Content changed:", {
        from: changeEvent.changes.content.from,
        to: changeEvent.changes.content.to,
      });
    }
  },
  onPollingError: (error) => {
    console.error("Polling error:", error.message);
    console.error("Error type:", error.type);
  },
});

console.log("Initial prompt:", pollingPrompt.prompt);
console.log("Polling active:", pollingPrompt.isPolling);

// Clean up when done
setTimeout(() => {
  pollingPrompt.stopPolling();
  console.log("Polling stopped");
}, 300000); // Stop after 5 minutes
```

#### Event Listeners

Use event listeners for fine-grained control over prompt updates:

```typescript
const pollingPrompt = await promptrun.prompt({
  projectId: "YOUR_PROJECT_ID",
  poll: 10000, // Poll every 10 seconds
});

// Add event listeners
pollingPrompt.on("change", (changeEvent) => {
  console.log("Change detected:", changeEvent.changes);
});

pollingPrompt.on("error", (pollingError) => {
  console.error("Polling error:", pollingError.message);
});

// One-time listeners (automatically removed after first event)
pollingPrompt.once("change", (changeEvent) => {
  console.log("First change detected:", changeEvent.prompt.version);
});

// Remove listeners
pollingPrompt.off("change"); // Removes all change listeners
```

#### Server-Sent Events (SSE)

For ultra-low latency updates, use Server-Sent Events instead of polling:

```typescript
// Use SSE for real-time updates (no polling interval needed)
const ssePrompt = await promptrun.prompt({
  projectId: "YOUR_PROJECT_ID",
  poll: "sse", // Enable Server-Sent Events
  onChange: (changeEvent) => {
    console.log("Real-time update via SSE:", changeEvent.changes);
  },
});

console.log("SSE connection active:", ssePrompt.isPolling);
```

#### Change Event Details

The `PromptrunPromptChangeEvent` provides detailed information about what changed:

```typescript
pollingPrompt.on("change", (changeEvent) => {
  console.log("Current prompt:", changeEvent.prompt);
  console.log("Previous prompt:", changeEvent.previousPrompt);

  // Check what specifically changed
  const { changes } = changeEvent;

  if (changes.version) {
    console.log(`Version: ${changes.version.from} -> ${changes.version.to}`);
  }

  if (changes.content) {
    console.log(`Content changed from "${changes.content.from}" to "${changes.content.to}"`);
  }

  if (changes.temperature) {
    console.log(`Temperature: ${changes.temperature.from} -> ${changes.temperature.to}`);
  }
});
```

## LLM Integration

Use your managed prompts with any LLM provider through seamless Vercel AI SDK integration.

### Basic Usage

Generate text using prompts from your Promptrun dashboard:

```typescript
import { generateText } from "ai";
import { PromptrunSDK } from "@promptrun-ai/sdk";

const promptrun = new PromptrunSDK({
  apiKey: process.env.PROMPTRUN_API_KEY!,
});

// Fetch prompt and create model
const promptData = await promptrun.prompt({
  projectId: "YOUR_PROJECT_ID",
  poll: 0,
});

const model = promptrun.model(promptData.model.model);

// Use the fetched prompt as a system message
const { text } = await generateText({
  model,
  messages: [
    { role: "system", content: promptData.prompt },
    { role: "user", content: "who are you?" },
  ],
});

console.log("AI Response:", text);
```

### Streaming Responses

For interactive applications, streaming is essential:

```typescript
import { streamText } from "ai";
import { PromptrunSDK } from "@promptrun-ai/sdk";

const promptrun = new PromptrunSDK({
  apiKey: process.env.PROMPTRUN_API_KEY!,
});

// Fetch the latest prompt from your project
const { prompt } = await promptrun.prompt({
  projectId: "YOUR_PROJECT_ID",
  poll: 1000,
});

const model = promptrun.model("anthropic/claude-sonnet-4");

// Stream response using messages format
const { textStream } = await streamText({
  model,
  messages: [
    { role: "system", content: prompt },
    { role: "user", content: "who are you?" },
  ],
});

console.log("AI Response (streaming):");
for await (const delta of textStream) {
  process.stdout.write(delta);
}
```

### Multi-turn Conversations

Build chatbots with conversation history and auto-updating prompts:

```typescript
import { generateText } from "ai";
import { PromptrunSDK } from "@promptrun-ai/sdk";

const promptrun = new PromptrunSDK({
  apiKey: process.env.PROMPTRUN_API_KEY!,
});

class ConversationBot {
  private model: any;
  private messages: Array<{
    role: "system" | "user" | "assistant";
    content: string;
  }> = [];

  async initialize(projectId: string) {
    // Fetch the system prompt
    const promptData = await promptrun.prompt({
      projectId,
      poll: 0, // Or enable polling for auto-updates
    });

    this.model = promptrun.model(promptData.model.model);
    this.messages = [{ role: "system", content: promptData.prompt }];
  }

  async sendMessage(userMessage: string): Promise<string> {
    // Add user message to conversation history
    this.messages.push({ role: "user", content: userMessage });

    // Generate response
    const { text } = await generateText({
      model: this.model,
      messages: this.messages,
    });

    // Add assistant response to conversation history
    this.messages.push({ role: "assistant", content: text });

    return text;
  }

  getConversationHistory() {
    return [...this.messages];
  }

  clearHistory() {
    // Keep only the system message
    this.messages = this.messages.filter((msg) => msg.role === "system");
  }
}

// Usage example
const bot = new ConversationBot();
await bot.initialize("YOUR_PROJECT_ID");

const response1 = await bot.sendMessage("Hello! What can you help me with?");
console.log("Bot:", response1);

const response2 = await bot.sendMessage("Can you tell me more about that?");
console.log("Bot:", response2);
```

### Auto-updating Conversations

Combine conversations with real-time prompt updates:

```typescript
class AutoUpdatingChatBot extends ConversationBot {
  private pollingPrompt: any;

  async initialize(projectId: string) {
    // Set up auto-updating prompt
    this.pollingPrompt = await promptrun.prompt({
      projectId,
      poll: 30000, // Update every 30 seconds
      onChange: (changeEvent) => {
        console.log(`System prompt updated to version ${changeEvent.prompt.version}`);
        // Update the system message in conversation history
        this.messages[0] = {
          role: "system",
          content: changeEvent.prompt.prompt,
        };
        // Update model if it changed
        this.model = promptrun.model(changeEvent.prompt.model.model);
      },
    });

    this.model = promptrun.model(this.pollingPrompt.model.model);
    this.messages = [{ role: "system", content: this.pollingPrompt.prompt }];
  }

  shutdown() {
    if (this.pollingPrompt) {
      this.pollingPrompt.stopPolling();
    }
  }
}

// Usage
const autoBot = new AutoUpdatingChatBot();
await autoBot.initialize("YOUR_PROJECT_ID");

const response = await autoBot.sendMessage("who are you?");
console.log("Bot:", response);

// The bot will automatically use updated prompts without restarting
process.on("SIGINT", () => autoBot.shutdown());
```

## Mastra Integration

The Promptrun SDK integrates seamlessly with [Mastra](https://mastra.ai), allowing you to create AI agents with dynamic, auto-updating instructions from your Promptrun dashboard.

### Basic Mastra Agent with Dynamic Instructions

```typescript
import { Agent, Memory } from "@mastra/core";
import { LibSQLStore } from "@mastra/memory";
import { PromptrunSDK } from "@promptrun-ai/sdk";

// Initialize Promptrun SDK
const promptrunSDK = new PromptrunSDK({
  apiKey: process.env.PROMPTRUN_API_KEY!,
});

// Create model for the agent
const model = promptrunSDK.model("openai/gpt-4o");

// Create agent with dynamic instructions from Promptrun
export const promptrunAgent = new Agent({
  name: "PromptRun Agent",
  instructions: async ({ runtimeContext }) => {
    const instructions = await promptrunSDK.prompt({
      projectId: "0af6cca1-6053-4ae7-aec1-767750637111",
      poll: 6000, // Auto-update instructions every 6 seconds
    });
    return instructions.prompt;
  },
  model,
  memory: new Memory({
    storage: new LibSQLStore({
      url: ":memory:",
    }),
  }),
});
```

### Advanced Mastra Integration with Event Handling

For production applications, you might want more control over instruction updates:

```typescript
import { Agent, Memory } from "@mastra/core";
import { LibSQLStore } from "@mastra/memory";
import { PromptrunSDK } from "@promptrun-ai/sdk";

class MastraPromptrunAgent {
  private agent: Agent;
  private pollingPrompt: any;
  private currentInstructions: string = "";

  constructor(projectId: string) {
    this.initializeAgent(projectId);
  }

  private async initializeAgent(projectId: string) {
    const promptrunSDK = new PromptrunSDK({
      apiKey: process.env.PROMPTRUN_API_KEY!,
    });

    // Set up polling for instructions
    this.pollingPrompt = await promptrunSDK.prompt({
      projectId,
      poll: 30000, // Check for updates every 30 seconds
      onChange: (changeEvent) => {
        console.log(
          `Agent instructions updated to version ${changeEvent.prompt.version}`
        );
        this.currentInstructions = changeEvent.prompt.prompt;

        // Log what changed for debugging
        if (changeEvent.changes.content) {
          console.log("Instructions content changed");
        }
      },
      onPollingError: (error) => {
        console.error("Failed to update agent instructions:", error.message);
      },
    });

    this.currentInstructions = this.pollingPrompt.prompt;

    // Create the agent
    this.agent = new Agent({
      name: "Dynamic PromptRun Agent",
      instructions: async ({ runtimeContext }) => {
        // Always return the latest instructions
        return this.currentInstructions;
      },
      model: promptrunSDK.model(this.pollingPrompt.model.model),
      memory: new Memory({
        storage: new LibSQLStore({
          url: process.env.DATABASE_URL || ":memory:",
        }),
      }),
    });
  }

  getAgent(): Agent {
    return this.agent;
  }

  getCurrentInstructions(): string {
    return this.currentInstructions;
  }

  getInstructionsStatus() {
    return this.pollingPrompt?.getStatus();
  }

  shutdown() {
    if (this.pollingPrompt) {
      this.pollingPrompt.stopPolling();
      console.log("Agent instruction polling stopped");
    }
  }
}

// Usage
const dynamicAgent = new MastraPromptrunAgent("YOUR_PROJECT_ID");
export const agent = dynamicAgent.getAgent();

// Graceful shutdown
process.on("SIGINT", () => dynamicAgent.shutdown());
```

### Multi-Agent Setup with Different Instructions

You can create multiple agents with different instruction sets from different Promptrun projects:

```typescript
import { Agent, Memory } from "@mastra/core";
import { LibSQLStore } from "@mastra/memory";
import { PromptrunSDK } from "@promptrun-ai/sdk";

const promptrunSDK = new PromptrunSDK({
  apiKey: process.env.PROMPTRUN_API_KEY!,
});

// Customer Support Agent
export const supportAgent = new Agent({
  name: "Customer Support Agent",
  instructions: async () => {
    const instructions = await promptrunSDK.prompt({
      projectId: "support-project-id",
      tag: "production", // Use production-tagged instructions
      poll: 60000, // Update every minute
    });
    return instructions.prompt;
  },
  model: promptrunSDK.model("openai/gpt-4o"),
  memory: new Memory({
    storage: new LibSQLStore({ url: ":memory:" }),
  }),
});

// Sales Agent
export const salesAgent = new Agent({
  name: "Sales Agent",
  instructions: async () => {
    const instructions = await promptrunSDK.prompt({
      projectId: "sales-project-id",
      tag: "production",
      poll: 60000,
    });
    return instructions.prompt;
  },
  model: promptrunSDK.model("openai/gpt-4o-mini"), // Different model
  memory: new Memory({
    storage: new LibSQLStore({ url: ":memory:" }),
  }),
});

// Technical Assistant Agent
export const techAgent = new Agent({
  name: "Technical Assistant",
  instructions: async () => {
    const instructions = await promptrunSDK.prompt({
      projectId: "tech-project-id",
      version: "v2", // Use specific version
      poll: 30000,
    });
    return instructions.prompt;
  },
  model: promptrunSDK.model("openai/gpt-4o"),
  memory: new Memory({
    storage: new LibSQLStore({ url: ":memory:" }),
  }),
});
```

### Benefits of Promptrun + Mastra Integration

- **Dynamic Instructions**: Update agent behavior without redeploying
- **Version Control**: Use specific versions or tags for different environments
- **Real-time Updates**: Agents automatically adapt to instruction changes
- **Centralized Management**: Manage all agent instructions from Promptrun dashboard
- **A/B Testing**: Easily test different instruction sets by updating prompts
- **Rollback Capability**: Quickly revert to previous instruction versions

## Advanced Usage

### Long-running Applications with Auto-updates

Perfect for chatbots, APIs, or any long-running service that needs to stay up-to-date:

```typescript
import { generateText } from "ai";
import { PromptrunSDK } from "@promptrun-ai/sdk";

const promptrun = new PromptrunSDK({
  apiKey: process.env.PROMPTRUN_API_KEY!,
});

class ChatBot {
  private pollingPrompt: any;
  private model: any;

  async initialize() {
    // Set up auto-updating prompt
    this.pollingPrompt = await promptrun.prompt({
      projectId: "YOUR_PROJECT_ID",
      poll: 60000, // Check for updates every minute
      onChange: (changeEvent) => {
        console.log(`Prompt updated to version ${changeEvent.prompt.version}`);
        // Update the model if the model type changed
        this.model = promptrun.model(changeEvent.prompt.model.model);
      },
    });

    // Initial model setup
    this.model = promptrun.model(this.pollingPrompt.model.model);
    console.log("ChatBot initialized with auto-updating prompts");
  }

  async chat(userMessage: string) {
    // Always use the latest prompt version
    const { text } = await generateText({
      model: this.model,
      prompt: `${this.pollingPrompt.prompt}\n\nUser: ${userMessage}\nAssistant:`,
    });

    return text;
  }

  async chatWithMessages(userMessage: string) {
    // Use messages format with auto-updating system message
    const { text } = await generateText({
      model: this.model,
      messages: [
        { role: "system", content: this.pollingPrompt.prompt },
        { role: "user", content: userMessage },
      ],
    });

    return text;
  }

  shutdown() {
    this.pollingPrompt.stopPolling();
    console.log("ChatBot shutdown complete");
  }
}

// Usage
const bot = new ChatBot();
await bot.initialize();

// Using simple prompt format
const response1 = await bot.chat("Hello!");
console.log("Simple format:", response1);

// Using messages array format
const response2 = await bot.chatWithMessages("who are you?");
console.log("Messages format:", response2);

// Gracefully shutdown when done
process.on("SIGINT", () => bot.shutdown());
```

### Prompt Caching

To improve performance and reduce costs, you can cache prompt completions on the Promptrun backend.

1.  **First Call (Populating the Cache)**: On the first request, provide a unique cache ID.

    ```typescript
    const model = promptrun.model("openai/gpt-4o", {
      cache: { id: "user-123-summary-request" },
    });

    await generateText({
      model,
      prompt: "Summarize the following document for user 123...",
    });
    ```

2.  **Subsequent Calls (Using the Cache)**: On future calls, pass a special header to tell the SDK to use the cached version.

    ```typescript
    const model = promptrun.model("openai/gpt-4o", {
      cache: { id: "user-123-summary-request" },
    });

    const { text } = await generateText({
      model,
      prompt: "This prompt will be ignored.",
      headers: {
        "x-promptrun-use-cache": "true",
      },
    });
    ```

### Error Handling

The SDK provides comprehensive error handling with custom error classes:

```typescript
import { generateText } from "ai";
import {
  PromptrunSDK,
  PromptrunError,
  PromptrunAuthenticationError,
  PromptrunAPIError,
  PromptrunConnectionError,
  PromptrunConfigurationError,
} from "@promptrun-ai/sdk";

const promptrun = new PromptrunSDK({ apiKey: "INVALID_API_KEY" });
const model = promptrun.model("openai/gpt-4o");

try {
  await generateText({ model, prompt: "This will fail." });
} catch (error) {
  if (error instanceof PromptrunAuthenticationError) {
    console.error("Authentication Failed:", error.message);
  } else if (error instanceof PromptrunAPIError) {
    console.error("API Error:", error.message);
  } else if (error instanceof PromptrunConnectionError) {
    console.error("Connection Error:", error.message);
  } else if (error instanceof PromptrunConfigurationError) {
    console.error("Configuration Error:", error.message);
    console.error("Parameter:", error.parameter);
    console.error("Provided value:", error.providedValue);
    console.error("Expected value:", error.expectedValue);
  } else if (error instanceof PromptrunError) {
    console.error("A Promptrun SDK Error Occurred:", error.message);
  } else {
    console.error("An unknown error occurred:", error);
  }
}
```

#### Polling Error Handling

Polling errors include automatic retry with exponential backoff:

```typescript
const pollingPrompt = await promptrun.prompt({
  projectId: "YOUR_PROJECT_ID",
  poll: 10000,
  onPollingError: (pollingError) => {
    console.error("Polling error details:", {
      message: pollingError.message,
      type: pollingError.type,
      consecutiveErrors: pollingError.consecutiveErrors,
      backoffMultiplier: pollingError.backoffMultiplier,
      projectId: pollingError.projectId,
      statusCode: pollingError.statusCode,
      cause: pollingError.cause,
    });
  },
});
```

#### Error Types

| Error Class                    | When It's Thrown                                                                         |
| ------------------------------ | ---------------------------------------------------------------------------------------- |
| `PromptrunAuthenticationError` | On an HTTP `401 Unauthorized` response. Your API key is likely invalid or missing.       |
| `PromptrunAPIError`            | On any other non-successful HTTP response (e.g., `400`, `404`, `500`).                   |
| `PromptrunConnectionError`     | When the SDK fails to connect to the Promptrun API due to a network issue.               |
| `PromptrunConfigurationError`  | When invalid configuration is provided (e.g., polling interval too aggressive).          |
| `PromptrunPollingError`        | Specific to polling operations, includes backoff and retry information.                  |
| `PromptrunError`               | The base class for all SDK-specific errors. Catch this to handle any error from the SDK. |

## API Reference

### PromptrunSDK

#### Constructor Options

```typescript
const promptrun = new PromptrunSDK({
  apiKey: string;        // Your Promptrun API key
  baseURL?: string;      // Custom API base URL (optional)
  headers?: Record<string, string>; // Additional headers (optional)
});
```

#### Methods

- `model(modelId: string, options?: PromptrunLanguageModelOptions)` - Creates a language model instance
- `prompt(options: PromptrunPromptOptions)` - Fetches prompts with optional polling

### PromptrunPollingPrompt

When polling is enabled (`poll > 0` or `poll: "sse"`), you get a `PromptrunPollingPrompt` with these additional methods:

#### Properties

- `isPolling: boolean` - Whether polling is currently active
- All properties from the base `PromptrunPrompt` interface

#### Methods

- `getCurrent(): PromptrunPrompt` - Get the current prompt data
- `stopPolling(): void` - Stop polling for updates
- `getStatus(): PromptrunPollingStatus` - Get detailed polling status
- `onError(handler: Function): void` - Add error handler
- `removeErrorHandler(): void` - Remove error handler
- `on(event: "change" | "error", handler: Function): void` - Add event listener
- `off(event: "change" | "error", handler?: Function): void` - Remove event listener
- `once(event: "change" | "error", handler: Function): void` - Add one-time event listener

### Prompt Options

```typescript
interface PromptrunPromptOptions {
  projectId: string; // Required: Your project ID
  poll?: number | "sse"; // Polling interval in ms, "sse", or 0 to disable
  version?: string; // Specific version to fetch
  tag?: string; // Specific tag to fetch
  variables?: Record<string, any>; // Variables for prompt template replacement
  onChange?: (event: PromptrunPromptChangeEvent) => void; // Change callback
  onPollingError?: (error: PromptrunPollingError) => void; // Error callback
  enforceMinimumInterval?: boolean; // Enforce 5-second minimum interval
}
```

## Quick Reference

### Usage Patterns Summary

| Pattern                | Use Case                        | Example                                                                               |
| ---------------------- | ------------------------------- | ------------------------------------------------------------------------------------- |
| **Static Prompt**      | Fixed prompts                   | `await promptrun.prompt({ projectId, poll: 0 })`                                      |
| **Polling Updates**    | Auto-updating prompts           | `await promptrun.prompt({ projectId, poll: 30000 })`                                  |
| **SSE Updates**        | Real-time updates               | `await promptrun.prompt({ projectId, poll: "sse" })`                                  |
| **Prompt Variables**   | Dynamic prompt content          | `await promptrun.prompt({ projectId, variables: { name: "John" } })`                  |
| **Version Control**    | Specific prompt versions        | `await promptrun.prompt({ projectId, version: "v2" })`                                |
| **Tagged Prompts**     | Environment-specific prompts    | `await promptrun.prompt({ projectId, tag: "production" })`                            |
| **System + User**      | AI assistants with instructions | `messages: [{ role: "system", content: prompt }, { role: "user", content: "Hello" }]` |
| **Multi-turn Chat**    | Conversation history            | Maintain `messages` array with conversation                                           |
| **Mastra Integration** | AI Agents                       | `instructions: async () => (await promptrun.prompt(...)).prompt`                      |

### Common Code Snippets

#### Fetch prompt and use as system message:

```typescript
const promptData = await promptrun.prompt({
  projectId: "YOUR_PROJECT_ID",
  poll: 0,
});
const model = promptrun.model(promptData.model.model);

const result = await generateText({
  model,
  messages: [
    { role: "system", content: promptData.prompt },
    { role: "user", content: "who are you?" },
  ],
});
```

#### Auto-updating system prompt:

```typescript
const pollingPrompt = await promptrun.prompt({
  projectId: "YOUR_PROJECT_ID",
  poll: 30000,
  onChange: (event) => {
    console.log("Updated prompt:", event.prompt.prompt);
  },
});
```

#### Streaming with messages:

```typescript
const { textStream } = await streamText({
  model,
  messages: [
    { role: "system", content: promptData.prompt },
    { role: "user", content: userMessage },
  ],
});
```

#### Mastra agent with dynamic instructions:

```typescript
export const agent = new Agent({
  name: "PromptRun Agent",
  instructions: async () => {
    const instructions = await promptrunSDK.prompt({
      projectId: "YOUR_PROJECT_ID",
      poll: 6000,
    });
    return instructions.prompt;
  },
  model: promptrunSDK.model("openai/gpt-4o"),
});
```

## Contributing

Contributions are welcome! If you find a bug or have a feature request, please open an issue on our [GitHub repository](https://github.com/Promptrun-ai/promptrun-ai-sdk/issues).

## License

MIT License

Copyright (c) 2025 Promptrun.ai

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights  
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell  
copies of the Software, and to permit persons to whom the Software is  
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all  
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR  
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,  
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE  
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER  
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,  
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE  
SOFTWARE.
