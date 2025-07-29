import { generateText } from "ai";
import { PromptrunSDK } from "../src";

async function aiIntegration() {
  const promptrun = new PromptrunSDK({
    apiKey: process.env.PROMPTRUN_API_KEY || "your-api-key",
  });

  // Fetch a prompt to use as system message
  const promptData = await promptrun.prompt({
    projectId: process.env.PROMPTRUN_PROJECT_ID || "your-project-id",
  });

  // Initialize AI model
  const model = promptrun.model("openai/gpt-4o");

  // Generate text using the prompt as system message
  const { text } = await generateText({
    model,
    messages: [
      { role: "system", content: promptData.prompt || "" },
      {
        role: "user",
        content: "Write a short story about a robot learning to paint.",
      },
    ],
  });

  console.log("AI Response:", text);
}

aiIntegration().catch(console.error);
