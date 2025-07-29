import { PromptrunSDK } from "../src";

async function pollingExample() {
  const promptrun = new PromptrunSDK({
    apiKey: process.env.PROMPTRUN_API_KEY || "your-api-key",
  });

  console.log("Starting polling example...");

  // Enable polling with event listeners
  const promptData = await promptrun.prompt({
    projectId: process.env.PROMPTRUN_PROJECT_ID || "your-project-id",
    poll: 10000, // Poll every 10 seconds
    onChange: (changeEvent) => {
      console.log("Prompt updated!");
      console.log("New version:", changeEvent.prompt.version);
      console.log("Changes:", changeEvent.changes);
    },
    onPollingError: (error) => {
      console.error("Polling error:", error.message);
    },
  });

  console.log("Initial prompt:", promptData.prompt);
  console.log("Is polling:", promptData.isPolling);

  // Keep polling for 30 seconds, then stop
  setTimeout(() => {
    console.log("Stopping polling...");
    if (promptData.stopPolling) {
      promptData.stopPolling();
    }
    console.log("Polling stopped. Program will exit.");
  }, 30000);
}

pollingExample().catch(console.error);
