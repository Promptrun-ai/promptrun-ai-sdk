import { generateText } from "ai";
import { PromptrunSDK } from "../src/promptrun-provider";

const promptrun = new PromptrunSDK({
  apiKey: process.env.PROMPTRUN_API_KEY!,
});

// Multi-turn conversations examples from the README

class ConversationBot {
  public model: any;
  public messages: Array<{
    role: "system" | "user" | "assistant";
    content: string;
  }> = [];

  async initialize(projectId: string) {
    // Fetch the system prompt
    const promptData = await promptrun.prompt({
      projectId,
      poll: 0, // Or enable polling for auto-updates
    });

    this.model = promptrun.model(
      promptData.modelInfo?.model || "openai/gpt-4o"
    );

    // Set the system message
    this.messages = [{ role: "system", content: promptData.prompt || "" }];
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
          content: changeEvent.prompt.prompt || "",
        };
        // Update model if it changed
        this.model = promptrun.model(
          changeEvent.prompt.modelInfo?.model || "openai/gpt-4o"
        );
      },
    });

    this.model = promptrun.model(
      this.pollingPrompt.modelInfo?.model || "openai/gpt-4o"
    );
    this.messages = [
      { role: "system", content: this.pollingPrompt.prompt || "" },
    ];
  }

  shutdown() {
    if (this.pollingPrompt) {
      this.pollingPrompt.stopPolling?.();
    }
  }
}

async function basicConversationExample() {
  console.log("=== Basic Conversation Example ===");

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

async function autoUpdatingConversationExample() {
  console.log("\n=== Auto-Updating Conversation Example ===");

  const autoBot = new AutoUpdatingChatBot();
  await autoBot.initialize("YOUR_PROJECT_ID");

  const response = await autoBot.sendMessage("who are you?");
  console.log("Bot:", response);

  // The bot will automatically use updated prompts without restarting
  console.log("Auto-updating bot is ready. Press Ctrl+C to stop.");

  // Cleanup on exit
  process.on("SIGINT", () => {
    console.log("\nShutting down auto-updating bot...");
    autoBot.shutdown();
    process.exit(0);
  });
}

async function conversationWithHistoryManagement() {
  console.log("\n=== Conversation with History Management ===");

  const bot = new ConversationBot();
  await bot.initialize("YOUR_PROJECT_ID");

  // Start a conversation
  await bot.sendMessage("Hi, I'm John. Nice to meet you!");
  await bot.sendMessage("I'm interested in learning about AI.");

  console.log("Current conversation history:");
  console.log(bot.getConversationHistory());

  // Clear history but keep system prompt
  bot.clearHistory();
  console.log("\nAfter clearing history:");
  console.log(bot.getConversationHistory());

  // Start fresh conversation
  const response = await bot.sendMessage("What's your name?");
  console.log("Bot:", response);
}

async function conversationWithCustomSystemPrompt() {
  console.log("\n=== Conversation with Custom System Prompt ===");

  const bot = new ConversationBot();

  // Initialize with a custom system prompt
  const promptData = await promptrun.prompt({
    projectId: "YOUR_PROJECT_ID",
    poll: 0,
  });

  bot.model = promptrun.model(promptData.modelInfo?.model || "openai/gpt-4o");
  bot.messages = [
    {
      role: "system",
      content: promptData.prompt || "You are a helpful AI assistant.",
    },
  ];

  // Have a conversation
  const response1 = await bot.sendMessage("What's your role?");
  console.log("Bot:", response1);

  const response2 = await bot.sendMessage("Can you help me with coding?");
  console.log("Bot:", response2);
}

async function main() {
  try {
    await basicConversationExample();
    await conversationWithHistoryManagement();
    await conversationWithCustomSystemPrompt();
    await autoUpdatingConversationExample();
  } catch (error) {
    console.error("Error:", error);
  }
}

// Run examples if this file is executed directly
if (require.main === module) {
  main();
}

export {
  AutoUpdatingChatBot,
  autoUpdatingConversationExample,
  basicConversationExample,
  ConversationBot,
  conversationWithCustomSystemPrompt,
  conversationWithHistoryManagement,
};
