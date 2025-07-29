import { z } from "zod";
import { PromptrunSDK } from "../src/promptrun-provider";

// Example usage of the enhanced prompt functionality
async function exampleUsage() {
  const promptrun = new PromptrunSDK({
    apiKey: "your-api-key-here",
  });

  // Define the input schema using Zod
  const inputsSchema = z.object({
    symbol: z.string(),
    chain: z.enum(["ethereum", "base", "arbitrum"]),
    address: z.string(),
  });

  // Example inputs that match the schema
  const inputs = {
    symbol: "ETH",
    chain: "ethereum",
    address: "0xabc...",
  };

  try {
    // Use the enhanced prompt method
    const {
      systemPrompt,
      inputs: extractedInputs,
      template,
      version,
      model,
    } = await promptrun.prompt({
      projectId: "your-project-id",
      inputsSchema,
      inputs,
    });

    console.log("System Prompt (with processed variables):", systemPrompt);
    console.log("Extracted Variables:", extractedInputs);
    console.log("Template (raw prompt):", template);
    console.log("Version:", version);
    console.log("Model:", model); // "gpt-4"

    // Example output:
    // System Prompt: "Analyze the ETH token on ethereum blockchain. Address: 0xabc..."
    // Extracted Variables: ["symbol", "chain", "address"]
    // Template: "Analyze the {{symbol}} token on {{chain}} blockchain. Address: {{address}}"
    // Version: 2
  } catch (error) {
    console.error("Error:", error);
  }
}

// Example without schema validation
async function exampleWithoutSchema() {
  const promptrun = new PromptrunSDK({
    apiKey: "your-api-key-here",
  });

  const inputs = {
    symbol: "ETH",
    chain: "ethereum",
    address: "0xabc...",
  };

  try {
    const result = await promptrun.prompt({
      projectId: "your-project-id",
      inputs, // No schema validation
    });

    console.log("Result:", result);
  } catch (error) {
    console.error("Error:", error);
  }
}

// Example with missing variables (will show warning but continue)
async function exampleWithMissingVariables() {
  const promptrun = new PromptrunSDK({
    apiKey: "your-api-key-here",
  });

  const inputs = {
    symbol: "ETH",
    // Missing chain and address - will show warning
  };

  try {
    const result = await promptrun.prompt({
      projectId: "your-project-id",
      inputs,
    });

    console.log("Result with missing variables:", result);
    // Will output: "Analyze the ETH token on {{chain}} blockchain. Address: {{address}}"
    // And show a warning about missing variables
  } catch (error) {
    console.error("Error:", error);
  }
}

// Example with invalid inputs (will throw error)
async function exampleWithInvalidInputs() {
  const promptrun = new PromptrunSDK({
    apiKey: "your-api-key-here",
  });

  const inputsSchema = z.object({
    symbol: z.string(),
    chain: z.enum(["ethereum", "base", "arbitrum"]),
    address: z.string(),
  });

  const inputs = {
    symbol: "ETH",
    chain: "invalid-chain", // This will cause validation error
    address: "0xabc...",
  };

  try {
    const result = await promptrun.prompt({
      projectId: "your-project-id",
      inputsSchema,
      inputs,
    });

    console.log("Result:", result);
  } catch (error) {
    console.error("Validation error:", error);
    // This will throw a PromptrunConfigurationError
  }
}

// Run examples
if (require.main === module) {
  console.log("Enhanced Prompt Usage Examples:");
  console.log("================================\n");

  // Note: These examples require valid API keys and project IDs to run
  console.log("To run these examples:");
  console.log("1. Replace 'your-api-key-here' with your actual API key");
  console.log("2. Replace 'your-project-id' with your actual project ID");
  console.log("3. Uncomment the function calls below");

  // exampleUsage();
  // exampleWithoutSchema();
  // exampleWithMissingVariables();
  // exampleWithInvalidInputs();
}

export {
  exampleUsage,
  exampleWithInvalidInputs,
  exampleWithMissingVariables,
  exampleWithoutSchema,
};
