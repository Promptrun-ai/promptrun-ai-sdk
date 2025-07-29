import { generateText, streamText } from "ai";
import { PromptrunSDK } from "../src/promptrun-provider";

// Basic usage examples from the README

// 1. Initialize the Promptrun SDK with your API key
const promptrun = new PromptrunSDK({
  apiKey: process.env.PROMPTRUN_API_KEY!,
});

// 2. Create a model instance
const model = promptrun.model("openai/gpt-4o");

async function basicGenerateText() {
  console.log("=== Basic generateText Example ===");

  // 3. Use the model with the Vercel AI SDK
  const { text } = await generateText({
    model,
    prompt: "Tell me a short story about a robot who learns to paint.",
  });

  console.log("Generated text:", text);
}

async function messagesArrayFormat() {
  console.log("\n=== Messages Array Format Example ===");

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

  console.log("Generated text:", text);
}

async function streamingExample() {
  console.log("\n=== Streaming Example ===");

  const { textStream } = await streamText({
    model,
    prompt: "Tell me a short story about a robot who learns to paint.",
  });

  console.log("Streaming response:");
  for await (const delta of textStream) {
    process.stdout.write(delta);
  }
  console.log("\n"); // New line after streaming completes
}

async function streamingWithMessages() {
  console.log("\n=== Streaming with Messages Format ===");

  const { textStream } = await streamText({
    model,
    messages: [
      { role: "system", content: "You are a creative storyteller." },
      { role: "user", content: "Tell me a story about a magical forest." },
    ],
  });

  console.log("Streaming response:");
  for await (const delta of textStream) {
    process.stdout.write(delta);
  }
  console.log("\n");
}

async function dynamicPromptsExample() {
  console.log("\n=== Dynamic Prompts Example ===");

  // Fetch the latest prompt from your project
  const promptData = await promptrun.prompt({
    projectId: "YOUR_PROMPTRUN_PROJECT_ID",
    poll: 0, // Disable polling for one-time fetch
  });

  const model = promptrun.model("anthropic/claude-sonnet-4");

  // Stream response using messages format
  const { textStream } = await streamText({
    model,
    messages: [
      { role: "system", content: promptData.prompt || "" },
      { role: "user", content: "who are you?" },
    ],
  });

  console.log("AI Response (streaming):");
  for await (const delta of textStream) {
    process.stdout.write(delta);
  }
  console.log("\n");
}

async function versionAndTagSupport() {
  console.log("\n=== Version and Tag Support Example ===");

  // Fetch a specific version
  const promptData = await promptrun.prompt({
    projectId: "YOUR_PROJECT_ID",
    version: "v2",
    poll: 0,
  });

  console.log(`Using prompt version: ${promptData.version}`);
  console.log(`Prompt content: ${promptData.prompt}`);

  // Fetch a tagged version (e.g., "production", "staging")
  const productionPrompt = await promptrun.prompt({
    projectId: "YOUR_PROJECT_ID",
    tag: "production",
    poll: 0,
  });

  console.log(`Production prompt version: ${productionPrompt.version}`);
}

async function main() {
  try {
    await basicGenerateText();
    await messagesArrayFormat();
    await streamingExample();
    await streamingWithMessages();
    await dynamicPromptsExample();
    await versionAndTagSupport();
  } catch (error) {
    console.error("Error:", error);
  }
}

// Run examples if this file is executed directly
if (require.main === module) {
  main();
}

export {
  basicGenerateText,
  dynamicPromptsExample,
  messagesArrayFormat,
  streamingExample,
  streamingWithMessages,
  versionAndTagSupport,
};
