# Promptrun AI SDK

[![NPM Version](https://img.shields.io/npm/v/@promptrun-ai/sdk.svg)](https://www.npmjs.com/package/@promptrun-ai/sdk)
[![NPM Downloads](https://img.shields.io/npm/dm/@promptrun-ai/sdk.svg)](https://www.npmjs.com/package/@promptrun-ai/sdk)
![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)
[![Build Status](https://img.shields.io/github/actions/workflow/status/Promptrun-ai/promptrun-ai-sdk/main.yml?branch=main)](https://github.com/Promptrun-ai/promptrun-ai-sdk/actions)

The official Promptrun AI SDK for Node.js provides a seamless bridge between your application and the Promptrun platform. It is designed for first-class integration with the **Vercel AI SDK**, enabling powerful, stream-first interactions with language models managed through your Promptrun dashboard.

Unlock dynamic prompt management, versioning, performance caching, real-time updates, and robust error handling in your AI applications with just a few lines of code.

## Key Features

- **Seamless Vercel AI SDK Integration**: Use the Promptrun SDK directly with `generateText`, `streamText`, and other Vercel AI SDK helpers.
- **Dynamic Prompt Management**: Fetch and poll your prompt templates directly from the Promptrun server, allowing you to update prompts in real-time without redeploying your application.
- **Real-time Updates**: Event-driven architecture with polling and Server-Sent Events (SSE) support for instant prompt updates.
- **Event-driven Architecture**: Listen for prompt changes with `onChange` callbacks and event listeners (`on`, `off`, `once`).
- **Performance Caching**: Built-in support for caching prompts on the Promptrun backend to reduce latency and costs on subsequent identical calls.
- **Robust, Typed Error Handling**: A clear set of custom error classes (`PromptrunAuthenticationError`, `PromptrunAPIError`, etc.) lets you build resilient applications that can gracefully handle API issues.
- **Streaming First**: Full support for streaming responses, perfect for building interactive, real-time user experiences.
- **Fully Typed**: Written in TypeScript to provide excellent autocompletion and type safety.

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

## Getting Started

Using the Promptrun SDK is simple. Instantiate the client and use the `.model()` method to create a language model compatible with the Vercel AI SDK.

### Basic Usage with `generateText`

This example shows how to generate a complete text response.

```typescript
import { generateText } from "ai";
import { PromptrunSDK } from "@promptrun-ai/sdk";

// 1. Initialize the Promptrun SDK with your API key
const promptrun = new PromptrunSDK({
  apiKey: process.env.PROMPTRUN_API_KEY!,
});

// 2. Create a model instance
const model = promptrun.model("openai/gpt-4o");

async function main() {
  // 3. Use the model with the Vercel AI SDK
  const { text } = await generateText({
    model,
    prompt: "Tell me a short story about a robot who learns to paint.",
  });

  console.log(text);
}

main();
```

### Using Messages Array Format

For chat applications, you'll often want to use the messages array format with system and user messages:

```typescript
import { generateText } from "ai";
import { PromptrunSDK } from "@promptrun-ai/sdk";

const promptrun = new PromptrunSDK({
  apiKey: process.env.PROMPTRUN_API_KEY!,
});

const model = promptrun.model("openai/gpt-4o");

async function main() {
  const { text } = await generateText({
    model,
    messages: [
      {
        role: "system",
        content:
          "You are a helpful AI assistant that specializes in creative writing.",
      },
      {
        role: "user",
        content: "Tell me a short story about a robot who learns to paint.",
      },
    ],
  });

  console.log(text);
}

main();
```

### Streaming with `streamText`

For interactive applications, streaming is essential. The SDK fully supports this out of the box.

```typescript
import { streamText } from "ai";
import { PromptrunSDK } from "@promptrun-ai/sdk";

const promptrun = new PromptrunSDK({
  apiKey: process.env.PROMPTRUN_API_KEY!,
});

const model = promptrun.model("openai/gpt-4o");

async function main() {
  const { textStream } = await streamText({
    model,
    prompt: "Tell me a short story about a robot who learns to paint.",
  });

  // The stream is ready to be consumed
  for await (const delta of textStream) {
    process.stdout.write(delta);
  }
}

main();
```

### Streaming with Messages Format and Dynamic Prompts

You can also combine streaming with the messages format and dynamic prompts:

```typescript
import { streamText } from "ai";
import { PromptrunSDK } from "@promptrun-ai/sdk";

const promptrun = new PromptrunSDK({
  apiKey: process.env.PROMPTRUN_API_KEY!,
});

async function main() {
  // Fetch the latest prompt from your project
  const { prompt } = await promptrun.prompt({
    projectId: "YOUR_PROMPTRUN_PROJECT_ID",
    poll: 1000, // Not mandatory
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
  console.log("\n"); // New line after streaming completes
}

main();
```

## Dynamic Prompt Management

### Fetching Prompts from the Server

Instead of hardcoding prompts, you can fetch them from your Promptrun project. This allows you to manage prompts through your dashboard and update them without code changes.

```typescript
import { generateText } from "ai";
import { PromptrunSDK } from "@promptrun-ai/sdk";

const promptrun = new PromptrunSDK({
  apiKey: process.env.PROMPTRUN_API_KEY!,
});

async function main() {
  // Fetch a prompt template from your project (one-time fetch)
  const promptData = await promptrun.prompt({
    projectId: "YOUR_PROMPTRUN_PROJECT_ID",
    poll: 0, // Disable polling for one-time fetch
  });

  console.log(`Using prompt version: ${promptData.version}`);
  console.log(`Prompt content: ${promptData.prompt}`);

  // Create a model instance using the model specified in the prompt template
  const model = promptrun.model(promptData.model.model);

  // Use the fetched prompt content
  const { text } = await generateText({
    model,
    prompt: promptData.prompt,
  });

  console.log("Generated Text:", text);
}

main();
```

### Using Fetched Prompts as System Messages

A common pattern is to use the fetched prompt as a system message in a chat conversation:

```typescript
import { generateText } from "ai";
import { PromptrunSDK } from "@promptrun-ai/sdk";

const promptrun = new PromptrunSDK({
  apiKey: process.env.PROMPTRUN_API_KEY!,
});

async function main() {
  // Fetch prompt from your Promptrun project
  const promptData = await promptrun.prompt({
    projectId: "YOUR_PROMPTRUN_PROJECT_ID",
    poll: 0,
  });

  // Create model instance
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
}

main();
```

### Version and Tag Support

You can fetch specific versions or tagged versions of your prompts:

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

## Real-time Prompt Updates

### Event-Driven Polling

The SDK provides powerful event-driven functionality for real-time prompt updates. When you enable polling, you get a `PromptrunPollingPrompt` that extends the basic prompt with event capabilities.

```typescript
import { PromptrunSDK } from "@promptrun-ai/sdk";

const promptrun = new PromptrunSDK({
  apiKey: process.env.PROMPTRUN_API_KEY!,
});

async function main() {
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

      if (changeEvent.changes.temperature) {
        console.log("Temperature changed:", {
          from: changeEvent.changes.temperature.from,
          to: changeEvent.changes.temperature.to,
        });
      }
    },
    onPollingError: (error) => {
      console.error("Polling error:", error.message);
      console.error("Error type:", error.type);
      console.error("Consecutive errors:", error.consecutiveErrors);
    },
  });

  console.log("Initial prompt:", pollingPrompt.prompt);
  console.log("Polling active:", pollingPrompt.isPolling);

  // The prompt will automatically update when changes are detected
  // Your onChange callback will be called with details about what changed

  // Clean up when done
  setTimeout(() => {
    pollingPrompt.stopPolling();
    console.log("Polling stopped");
  }, 300000); // Stop after 5 minutes
}

main();
```

### Event Listeners (on/off/once)

For more fine-grained control, you can use event listeners instead of or in addition to callbacks:

```typescript
async function main() {
  const pollingPrompt = await promptrun.prompt({
    projectId: "YOUR_PROJECT_ID",
    poll: 10000, // Poll every 10 seconds
  });

  // Add event listeners
  pollingPrompt.on("change", (changeEvent) => {
    console.log("Change detected via event listener:", changeEvent.changes);
  });

  pollingPrompt.on("error", (pollingError) => {
    console.error("Polling error via event listener:", pollingError.message);
  });

  // One-time listeners (automatically removed after first event)
  pollingPrompt.once("change", (changeEvent) => {
    console.log("First change detected:", changeEvent.prompt.version);
  });

  // Remove specific listeners
  const errorHandler = (error) => console.log("Error:", error.message);
  pollingPrompt.on("error", errorHandler);
  pollingPrompt.off("error", errorHandler); // Remove specific handler

  // Remove all listeners for an event
  pollingPrompt.off("change"); // Removes all change listeners

  // Get current status
  const status = pollingPrompt.getStatus();
  console.log("Polling status:", {
    isPolling: status.isPolling,
    currentInterval: status.currentInterval,
    consecutiveErrors: status.consecutiveErrors,
    lastError: status.lastError,
    lastSuccessfulFetch: status.lastSuccessfulFetch,
  });
}
```

### Server-Sent Events (SSE)

For ultra-low latency updates, you can use Server-Sent Events instead of polling:

```typescript
async function main() {
  // Use SSE for real-time updates (no polling interval needed)
  const ssePrompt = await promptrun.prompt({
    projectId: "YOUR_PROJECT_ID",
    poll: "sse", // Enable Server-Sent Events
    onChange: (changeEvent) => {
      console.log("Real-time update via SSE:", changeEvent.changes);
    },
  });

  console.log("SSE connection active:", ssePrompt.isPolling);

  // SSE provides instant updates when prompts change on the server
  // No need to wait for polling intervals
}
```

### Polling Configuration Options

The polling system includes intelligent backoff and error handling:

```typescript
const pollingPrompt = await promptrun.prompt({
  projectId: "YOUR_PROJECT_ID",
  poll: 5000, // Poll every 5 seconds (minimum allowed)
  enforceMinimumInterval: true, // Enforce 5-second minimum (default: true)

  // Advanced error handling
  onPollingError: (error) => {
    console.log("Error details:", {
      type: error.type, // 'rate_limit', 'authentication', 'network', 'api', 'unknown'
      message: error.message,
      consecutiveErrors: error.consecutiveErrors,
      backoffMultiplier: error.backoffMultiplier,
      statusCode: error.statusCode,
    });

    // Handle different error types
    switch (error.type) {
      case "rate_limit":
        console.log("Rate limited - polling will slow down automatically");
        break;
      case "authentication":
        console.log("Authentication failed - check your API key");
        break;
      case "network":
        console.log("Network error - will retry with backoff");
        break;
    }
  },
});

// Bypass minimum interval for testing (not recommended for production)
const aggressivePolling = await promptrun.prompt({
  projectId: "YOUR_PROJECT_ID",
  poll: 1000, // 1 second (normally not allowed)
  enforceMinimumInterval: false, // Allow aggressive polling
});
```

### Change Event Details

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
    console.log(
      `Content changed from "${changes.content.from}" to "${changes.content.to}"`
    );
  }

  if (changes.temperature) {
    console.log(
      `Temperature: ${changes.temperature.from} -> ${changes.temperature.to}`
    );
  }

  if (changes.tag) {
    console.log(`Tag: ${changes.tag.from} -> ${changes.tag.to}`);
  }

  if (changes.updatedAt) {
    console.log(
      `Updated: ${changes.updatedAt.from} -> ${changes.updatedAt.to}`
    );
  }
});
```

## Multi-turn Conversations

For building chatbots or conversational applications, you'll want to maintain conversation history:

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

    // Set the system message
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
    return [...this.messages]; // Return a copy
  }

  clearHistory() {
    // Keep only the system message
    this.messages = this.messages.filter((msg) => msg.role === "system");
  }
}

// Usage example
async function chatExample() {
  const bot = new ConversationBot();
  await bot.initialize("YOUR_PROJECT_ID");

  // First exchange
  const response1 = await bot.sendMessage("Hello! What can you help me with?");
  console.log("Bot:", response1);

  // Second exchange (bot remembers previous context)
  const response2 = await bot.sendMessage("Can you tell me more about that?");
  console.log("Bot:", response2);

  // View conversation history
  console.log("Full conversation:", bot.getConversationHistory());
}

chatExample();
```

### Real-time Conversations with Auto-updating Prompts

Combine multi-turn conversations with auto-updating prompts for production chatbots:

```typescript
class AutoUpdatingChatBot extends ConversationBot {
  private pollingPrompt: any;

  async initialize(projectId: string) {
    // Set up auto-updating prompt
    this.pollingPrompt = await promptrun.prompt({
      projectId,
      poll: 30000, // Update every 30 seconds
      onChange: (changeEvent) => {
        console.log(
          `System prompt updated to version ${changeEvent.prompt.version}`
        );
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

## Error Handling

### Basic Error Handling

The SDK throws custom error classes that all inherit from a base `PromptrunError`.

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

async function main() {
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
}

main();
```

### Polling Error Handling

Polling errors are handled specially and include automatic retry with exponential backoff:

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
      cause: pollingError.cause, // Original error that caused this
    });

    // Polling automatically continues with backoff
    // Rate limit errors get exponential backoff
    // Other errors get modest backoff after 3 consecutive failures
  },
});
```

### Error Types

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
  onChange?: (event: PromptrunPromptChangeEvent) => void; // Change callback
  onPollingError?: (error: PromptrunPollingError) => void; // Error callback
  enforceMinimumInterval?: boolean; // Enforce 5-second minimum interval
}
```

## Quick Reference

### Usage Patterns Summary

| Pattern                | Use Case                        | Example                                                                               |
| ---------------------- | ------------------------------- | ------------------------------------------------------------------------------------- |
| **Simple Prompt**      | Basic text generation           | `generateText({ model, prompt: "Hello" })`                                            |
| **Messages Array**     | Chat applications               | `generateText({ model, messages: [{ role: "user", content: "Hello" }] })`             |
| **System + User**      | AI assistants with instructions | `messages: [{ role: "system", content: prompt }, { role: "user", content: "Hello" }]` |
| **Static Prompt**      | Fixed prompts                   | `await promptrun.prompt({ projectId, poll: 0 })`                                      |
| **Polling Updates**    | Auto-updating prompts           | `await promptrun.prompt({ projectId, poll: 30000 })`                                  |
| **SSE Updates**        | Real-time updates               | `await promptrun.prompt({ projectId, poll: "sse" })`                                  |
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
    // Use event.prompt.prompt as your new system message
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
