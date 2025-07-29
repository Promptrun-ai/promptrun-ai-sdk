import { z } from "zod";
import { PromptrunSDK } from "../src";

async function enhancedPrompts() {
  const promptrun = new PromptrunSDK({
    apiKey: process.env.PROMPTRUN_API_KEY || "your-api-key",
  });

  // Define input schema for validation
  const inputsSchema = z.object({
    name: z.string().min(1, "Name is required"),
    age: z.number().min(0, "Age must be positive"),
    role: z.enum(["user", "admin", "moderator"]),
  });

  // Fetch prompt with input validation
  const promptData = await promptrun.prompt({
    projectId: process.env.PROMPTRUN_PROJECT_ID || "your-project-id",
    inputsSchema,
    inputs: {
      name: "John Doe",
      age: 30,
      role: "user",
    },
  });

  console.log("Processed prompt:", promptData.prompt);
  console.log("Template:", promptData.template);
  console.log("Inputs used:", promptData.inputs);
}

enhancedPrompts().catch(console.error);
