import { generateText } from "ai";
import { z } from "zod";
import { PromptrunSDK } from "../src/promptrun-provider";
import { PromptrunConfigurationError } from "../src/types";

const promptrun = new PromptrunSDK({
  apiKey: process.env.PROMPTRUN_API_KEY!,
});

// Enhanced prompt examples from the README

async function basicEnhancedPrompt() {
  console.log("=== Basic Enhanced Prompt Example ===");

  // Define your input schema using Zod
  const inputsSchema = z.object({
    symbol: z.string(),
    chain: z.enum(["ethereum", "base", "arbitrum"]),
    address: z.string(),
  });

  // Provide inputs that match the schema
  const inputs = {
    symbol: "ETH",
    chain: "ethereum",
    address: "0xabc...",
  };

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

  console.log("System Prompt (processed):", systemPrompt);
  console.log("Extracted Variables:", extractedInputs);
  console.log("Template (raw):", template);
  console.log("Version:", version);
  console.log("Model:", model);
}

async function cryptoAnalysisExample() {
  console.log("\n=== Crypto Analysis Example ===");

  // Define schema for crypto analysis inputs
  const cryptoAnalysisSchema = z.object({
    symbol: z.string().min(1, "Symbol is required"),
    chain: z.enum(["ethereum", "base", "arbitrum", "polygon"]),
    address: z
      .string()
      .regex(/^0x[a-fA-F0-9]{40}$/, "Invalid Ethereum address"),
    timeframe: z.enum(["1h", "24h", "7d", "30d"]).default("24h"),
  });

  async function analyzeCryptoToken(
    tokenData: z.infer<typeof cryptoAnalysisSchema>
  ) {
    try {
      const { systemPrompt, inputs, template, version } =
        await promptrun.prompt({
          projectId: "crypto-analysis-project",
          inputsSchema: cryptoAnalysisSchema,
          inputs: tokenData,
        });

      console.log("Analysis prompt:", systemPrompt);
      console.log("Available variables:", inputs);
      console.log("Template:", template);
      console.log("Template version:", version);

      // Use the processed prompt with your AI model
      const model = promptrun.model("openai/gpt-4o");
      const { text } = await generateText({
        model,
        prompt: systemPrompt,
      });

      return text;
    } catch (error) {
      if (error instanceof PromptrunConfigurationError) {
        console.error("Input validation failed:", error.message);
      } else {
        console.error("Analysis failed:", error);
      }
      throw error;
    }
  }

  // Usage
  const analysis = await analyzeCryptoToken({
    symbol: "ETH",
    chain: "ethereum",
    address: "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6",
    timeframe: "24h",
  });

  console.log("Analysis result:", analysis);
}

async function missingVariablesExample() {
  console.log("\n=== Missing Variables Example ===");

  const { systemPrompt, inputs } = await promptrun.prompt({
    projectId: "your-project-id",
    inputs: {
      symbol: "ETH",
      // Missing chain and address - will show warning
    },
  });

  console.log("System prompt with missing variables:", systemPrompt);
  console.log("Available inputs:", inputs);

  // Output will be: "Analyze the ETH token on {{chain}} blockchain. Address: {{address}}"
  // Console will show: "Warning: The following variables are defined in the prompt but not provided in inputs: chain, address. Continuing with unprocessed variables."
}

async function withoutSchemaValidation() {
  console.log("\n=== Without Schema Validation Example ===");

  const { systemPrompt, inputs, template, version } = await promptrun.prompt({
    projectId: "your-project-id",
    inputs: {
      name: "John",
      age: 30,
      city: "New York",
    },
  });

  console.log("Processed prompt:", systemPrompt);
  console.log("Template variables:", inputs);
  console.log("Template:", template);
  console.log("Version:", version);
}

async function errorHandlingExample() {
  console.log("\n=== Error Handling Example ===");

  try {
    await promptrun.prompt({
      projectId: "your-project-id",
      inputsSchema: z.object({
        age: z.number().min(0),
        email: z.string().email(),
      }),
      inputs: {
        age: -5, // Invalid: negative age
        email: "invalid-email", // Invalid: not an email
      },
    });
  } catch (error) {
    if (error instanceof PromptrunConfigurationError) {
      console.error("Validation failed:", error.message);
      console.error("Parameter:", error.parameter);
      console.error("Provided value:", error.providedValue);
    } else {
      console.error("Unexpected error:", error);
    }
  }
}

async function nestedObjectSchemaExample() {
  console.log("\n=== Nested Object Schema Example ===");

  const nestedSchema = z.object({
    user: z.object({
      name: z.string(),
      email: z.string().email(),
    }),
    token: z.object({
      symbol: z.string(),
      chain: z.enum(["ethereum", "base", "arbitrum"]),
      address: z.string(),
    }),
  });

  const inputs = {
    user: {
      name: "John Doe",
      email: "john@example.com",
    },
    token: {
      symbol: "ETH",
      chain: "ethereum",
      address: "0xabc...",
    },
  };

  const result = await promptrun.prompt({
    projectId: "test-project",
    inputsSchema: nestedSchema,
    inputs,
  });

  console.log("Nested object result:", {
    systemPrompt: result.systemPrompt,
    inputs: result.inputs,
    template: result.template,
    version: result.version,
    model: result.model,
  });
}

async function main() {
  try {
    await basicEnhancedPrompt();
    await cryptoAnalysisExample();
    await missingVariablesExample();
    await withoutSchemaValidation();
    await errorHandlingExample();
    await nestedObjectSchemaExample();
  } catch (error) {
    console.error("Error:", error);
  }
}

// Run examples if this file is executed directly
if (require.main === module) {
  main();
}

export {
  basicEnhancedPrompt,
  cryptoAnalysisExample,
  errorHandlingExample,
  missingVariablesExample,
  nestedObjectSchemaExample,
  withoutSchemaValidation,
};
