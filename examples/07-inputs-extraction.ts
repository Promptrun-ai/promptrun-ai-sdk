import { PromptrunSDK } from "../src/index";

/**
 * Example demonstrating inputs extraction functionality.
 *
 * This example shows how the SDK now extracts variables from prompts
 * in any case and includes them in the inputs field of the response.
 */
async function main() {
  // Initialize the SDK
  const sdk = new PromptrunSDK("your-api-key-here");

  try {
    console.log("=== Inputs Extraction Example ===\n");

    // Example 1: Extract variables without providing inputs
    console.log("1. Extracting variables from prompt template:");
    const result1 = await sdk.prompt({
      projectId: "your-project-id",
    });

    console.log("Extracted variables:", result1.inputs);
    console.log("Original prompt:", result1.prompt);
    console.log("Template:", result1.template);
    console.log();

    // Example 2: Extract variables and process with inputs
    console.log("2. Extracting variables and processing with inputs:");
    const result2 = await sdk.prompt({
      projectId: "your-project-id",
      inputs: {
        name: "Alice",
        age: 25,
        city: "New York",
      },
    });

    console.log("Extracted variables:", result2.inputs);
    console.log("Processed prompt:", result2.prompt);
    console.log("Template:", result2.template);
    console.log();

    // Example 3: Extract variables with polling
    console.log(
      "3. Extracting variables with polling (will stop after 5 seconds):"
    );
    const result3 = await sdk.prompt({
      projectId: "your-project-id",
      poll: 5000, // 5 seconds
    });

    console.log("Extracted variables:", result3.inputs);
    console.log("Is polling:", result3.isPolling);

    // Stop polling after 5 seconds
    setTimeout(() => {
      if (result3.stopPolling) {
        result3.stopPolling();
        console.log("Polling stopped");
      }
    }, 5000);
  } catch (error) {
    console.error("Error:", error);
  }
}

// Run the example
main().catch(console.error);
