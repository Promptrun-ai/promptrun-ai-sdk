import { z } from "zod";
import { PromptrunSDK } from "../src";

async function errorHandling() {
  const promptrun = new PromptrunSDK({
    apiKey: process.env.PROMPTRUN_API_KEY || "your-api-key",
  });

  try {
    // Try to fetch with invalid project ID
    const promptData = await promptrun.prompt({
      projectId: "invalid-project-id",
    });
    console.log("Success:", promptData.prompt);
  } catch (error) {
    console.error("Error fetching prompt:", error);
  }

  try {
    // Try to use enhanced prompts with invalid inputs
    const inputsSchema = z.object({
      name: z.string().min(1),
      age: z.number().min(0),
    });

    const promptData = await promptrun.prompt({
      projectId: process.env.PROMPTRUN_PROJECT_ID || "your-project-id",
      inputsSchema,
      inputs: {
        name: "", // Invalid: empty string
        age: -5, // Invalid: negative age
      },
    });
    console.log("Success:", promptData.prompt);
  } catch (error) {
    console.error("Validation error:", error);
  }

  try {
    // Try to use invalid polling interval
    const promptData = await promptrun.prompt({
      projectId: process.env.PROMPTRUN_PROJECT_ID || "your-project-id",
      poll: 1000, // Too aggressive (minimum is 5000ms)
    });
    console.log("Success:", promptData.prompt);
  } catch (error) {
    console.error("Polling error:", error);
  }
}

errorHandling().catch(console.error);
