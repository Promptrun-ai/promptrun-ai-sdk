# Promptrun AI SDK Examples

This folder contains practical examples demonstrating how to use the Promptrun AI SDK.

## Quick Start

1. Set up your environment variables:

```bash
export PROMPTRUN_API_KEY="your-api-key"
export PROMPTRUN_PROJECT_ID="your-project-id"
```

2. Run any example:

```bash
npx tsx examples/01-basic-usage.ts
```

## Examples Overview

### [01-basic-usage.ts](./01-basic-usage.ts)

**Basic prompt fetching** - The simplest way to use the SDK. Demonstrates default behavior (no polling).

### [02-enhanced-prompts.ts](./02-enhanced-prompts.ts)

**Enhanced prompts with validation** - Shows how to use Zod schemas for input validation and variable replacement.

### [03-polling-example.ts](./03-polling-example.ts)

**Real-time updates** - Demonstrates polling with event listeners for live prompt updates.

### [04-ai-integration.ts](./04-ai-integration.ts)

**AI model integration** - Shows how to use prompts with Vercel AI SDK for text generation.

### [05-version-tag-support.ts](./05-version-tag-support.ts)

**Version and tag support** - Demonstrates fetching specific versions or tagged prompts.

### [06-error-handling.ts](./06-error-handling.ts)

**Error handling** - Shows how to handle various types of errors gracefully.

## Key Concepts

### Default Behavior

- **No polling by default** - Programs exit normally
- **One-time fetch** - Get prompt content immediately
- **Simple and predictable** - No background processes

### Enhanced Prompts

- **Schema validation** - Use Zod for type-safe inputs
- **Variable replacement** - Replace `{{variables}}` in prompts
- **Error handling** - Validation errors with clear messages

### Polling

- **Explicit enablement** - Set `poll: number` to enable
- **Event listeners** - React to prompt changes
- **Clean shutdown** - Call `stopPolling()` when done

### AI Integration

- **System messages** - Use prompts as AI system messages
- **Vercel AI SDK** - Seamless integration
- **Multiple models** - Support for various AI providers

## Common Patterns

### One-time Fetch (Default)

```typescript
const promptData = await promptrun.prompt({
  projectId: "your-project-id",
  // poll defaults to 0 (no polling)
});
// Program exits normally
```

### Enhanced Prompts

```typescript
const promptData = await promptrun.prompt({
  projectId: "your-project-id",
  inputsSchema: z.object({ name: z.string() }),
  inputs: { name: "John" },
});
```

### Polling with Events

```typescript
const promptData = await promptrun.prompt({
  projectId: "your-project-id",
  poll: 10000,
  onChange: (event) => console.log("Updated:", event.prompt),
});
// Remember to call promptData.stopPolling() when done
```

## Troubleshooting

### Program Doesn't Exit

If your program doesn't exit, you likely have polling enabled:

```typescript
// Stop polling when done
promptData.stopPolling();
```

### TypeScript Errors

Some examples may show TypeScript warnings for optional properties. These are normal and work correctly at runtime.

### Missing Environment Variables

Make sure to set `PROMPTRUN_API_KEY` and `PROMPTRUN_PROJECT_ID` before running examples.

## Next Steps

- [Main Documentation](../README.md) - Complete API reference
- [Best Practices](../README.md#best-practices) - Production usage guidelines
- [API Reference](../README.md#api-reference) - Detailed method documentation
