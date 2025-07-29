import { PromptrunSDK } from "../src";

async function versionTagSupport() {
  const promptrun = new PromptrunSDK({
    apiKey: process.env.PROMPTRUN_API_KEY || "your-api-key",
  });

  // Fetch specific version
  const versionPrompt = await promptrun.prompt({
    projectId: process.env.PROMPTRUN_PROJECT_ID || "your-project-id",
    version: "2", // Fetch version 2
  });

  console.log("Version 2 prompt:", versionPrompt.prompt);
  console.log("Version:", versionPrompt.version);

  // Fetch by tag
  const taggedPrompt = await promptrun.prompt({
    projectId: process.env.PROMPTRUN_PROJECT_ID || "your-project-id",
    tag: "production", // Fetch production tag
  });

  console.log("Production prompt:", taggedPrompt.prompt);
  console.log("Tag:", taggedPrompt.tag);
}

versionTagSupport().catch(console.error);
