import { PromptrunSDK } from "../src/promptrun-provider";

const promptrun = new PromptrunSDK({
  apiKey: process.env.PROMPTRUN_API_KEY!,
});

// Real-time updates examples from the README

async function eventDrivenPolling() {
  console.log("=== Event-Driven Polling Example ===");

  // Enable polling (checks for updates every 30 seconds)
  const pollingPrompt = await promptrun.prompt({
    projectId: "YOUR_PROJECT_ID",
    poll: 30000, // Poll every 30 seconds
    onChange: (changeEvent) => {
      console.log("Prompt updated!", {
        newVersion: changeEvent.prompt.version,
        changes: changeEvent.changes,
        previousVersion: changeEvent.previousPrompt.version,
      });

      // Handle specific types of changes
      if (changeEvent.changes.content) {
        console.log("Content changed:", {
          from: changeEvent.changes.content.from,
          to: changeEvent.changes.content.to,
        });
      }

      if (changeEvent.changes.temperature) {
        console.log("Temperature changed:", {
          from: changeEvent.changes.temperature.from,
          to: changeEvent.changes.temperature.to,
        });
      }
    },
    onPollingError: (error) => {
      console.error("Polling error:", error.message);
      console.error("Error type:", error.type);
      console.error("Consecutive errors:", error.consecutiveErrors);
    },
  });

  console.log("Initial prompt:", pollingPrompt.prompt);
  console.log("Polling active:", pollingPrompt.isPolling);

  // The prompt will automatically update when changes are detected
  // Your onChange callback will be called with details about what changed

  // Clean up when done
  setTimeout(() => {
    pollingPrompt.stopPolling?.();
    console.log("Polling stopped");
  }, 300000); // Stop after 5 minutes
}

async function eventListenersExample() {
  console.log("\n=== Event Listeners Example ===");

  const pollingPrompt = await promptrun.prompt({
    projectId: "YOUR_PROJECT_ID",
    poll: 10000, // Poll every 10 seconds
  });

  // Add event listeners
  pollingPrompt.on?.("change", (changeEvent) => {
    console.log("Change detected via event listener:", changeEvent.changes);
  });

  pollingPrompt.on?.("error", (pollingError) => {
    console.error("Polling error via event listener:", pollingError.message);
  });

  // One-time listeners (automatically removed after first event)
  pollingPrompt.once?.("change", (changeEvent) => {
    console.log("First change detected:", changeEvent.prompt.version);
  });

  // Remove specific listeners
  const errorHandler = (error: unknown) =>
    console.log(
      "Error:",
      error instanceof Error ? error.message : String(error)
    );
  pollingPrompt.on?.("error", errorHandler);
  pollingPrompt.off?.("error", errorHandler); // Remove specific handler

  // Remove all listeners for an event
  pollingPrompt.off?.("change"); // Removes all change listeners

  // Get current status
  const status = pollingPrompt.getStatus?.();
  console.log("Polling status:", {
    isPolling: status?.isPolling,
    currentInterval: status?.currentInterval,
    consecutiveErrors: status?.consecutiveErrors,
    lastError: status?.lastError,
    lastSuccessfulFetch: status?.lastSuccessfulFetch,
  });
}

async function serverSentEventsExample() {
  console.log("\n=== Server-Sent Events Example ===");

  // Use SSE for real-time updates (no polling interval needed)
  const ssePrompt = await promptrun.prompt({
    projectId: "YOUR_PROJECT_ID",
    poll: "sse", // Enable Server-Sent Events
    onChange: (changeEvent) => {
      console.log("Real-time update via SSE:", changeEvent.changes);
    },
  });

  console.log("SSE connection active:", ssePrompt.isPolling);

  // SSE provides instant updates when prompts change on the server
  // No need to wait for polling intervals
}

async function pollingConfigurationExample() {
  console.log("\n=== Polling Configuration Example ===");

  const pollingPrompt = await promptrun.prompt({
    projectId: "YOUR_PROJECT_ID",
    poll: 5000, // Poll every 5 seconds (minimum allowed)
    enforceMinimumInterval: true, // Enforce 5-second minimum (default: true)

    // Advanced error handling
    onPollingError: (error) => {
      console.log("Error details:", {
        type: error.type, // 'rate_limit', 'authentication', 'network', 'api', 'unknown'
        message: error.message,
        consecutiveErrors: error.consecutiveErrors,
        backoffMultiplier: error.backoffMultiplier,
        statusCode: error.statusCode,
      });

      // Handle different error types
      switch (error.type) {
        case "rate_limit":
          console.log("Rate limited - polling will slow down automatically");
          break;
        case "authentication":
          console.log("Authentication failed - check your API key");
          break;
        case "network":
          console.log("Network error - will retry with backoff");
          break;
      }
    },
  });

  console.log("Polling configuration applied:", {
    isPolling: pollingPrompt.isPolling,
    status: pollingPrompt.getStatus?.(),
  });
}

async function aggressivePollingExample() {
  console.log("\n=== Aggressive Polling Example ===");

  // Bypass minimum interval for testing (not recommended for production)
  const aggressivePolling = await promptrun.prompt({
    projectId: "YOUR_PROJECT_ID",
    poll: 1000, // 1 second (normally not allowed)
    enforceMinimumInterval: false, // Allow aggressive polling
  });

  console.log("Aggressive polling active:", aggressivePolling.isPolling);
}

async function changeEventDetailsExample() {
  console.log("\n=== Change Event Details Example ===");

  const pollingPrompt = await promptrun.prompt({
    projectId: "YOUR_PROJECT_ID",
    poll: 15000, // Poll every 15 seconds
  });

  pollingPrompt.on?.("change", (changeEvent) => {
    console.log("Current prompt:", changeEvent.prompt);
    console.log("Previous prompt:", changeEvent.previousPrompt);

    // Check what specifically changed
    const { changes } = changeEvent;

    if (changes.version) {
      console.log(`Version: ${changes.version.from} -> ${changes.version.to}`);
    }

    if (changes.content) {
      console.log(
        `Content changed from "${changes.content.from}" to "${changes.content.to}"`
      );
    }

    if (changes.temperature) {
      console.log(
        `Temperature: ${changes.temperature.from} -> ${changes.temperature.to}`
      );
    }

    if (changes.tag) {
      console.log(`Tag: ${changes.tag.from} -> ${changes.tag.to}`);
    }

    if (changes.updatedAt) {
      console.log(
        `Updated: ${changes.updatedAt.from} -> ${changes.updatedAt.to}`
      );
    }
  });

  console.log("Change event listener attached");
}

async function main() {
  try {
    await eventDrivenPolling();
    await eventListenersExample();
    await serverSentEventsExample();
    await pollingConfigurationExample();
    await aggressivePollingExample();
    await changeEventDetailsExample();
  } catch (error) {
    console.error("Error:", error);
  }
}

// Run examples if this file is executed directly
if (require.main === module) {
  main();
}

export {
  aggressivePollingExample,
  changeEventDetailsExample,
  eventDrivenPolling,
  eventListenersExample,
  pollingConfigurationExample,
  serverSentEventsExample,
};
