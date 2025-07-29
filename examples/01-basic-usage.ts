import { PromptrunSDK } from "../src";

async function basicUsage() {
  // Initialize the SDK
  const promptrun = new PromptrunSDK({
    apiKey: process.env.PROMPTRUN_API_KEY || "your-api-key",
  });

  // Fetch a prompt (default behavior - no polling)
  const promptData = await promptrun.prompt({
    projectId: process.env.PROMPTRUN_PROJECT_ID || "your-project-id",
  });

  console.log("Prompt:", promptData.prompt);
  console.log("Version:", promptData.version);
  console.log("Is polling:", promptData.isPolling); // false by default
}

basicUsage().catch(console.error);
