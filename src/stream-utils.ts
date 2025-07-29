import { LanguageModelV1StreamPart } from "@ai-sdk/provider";
import { FinishReason } from "ai";
import { createParser, EventSourceMessage } from "eventsource-parser";
import { z } from "zod";

/**
 * Creates a transform stream that processes PromptRun API responses
 * into the `LanguageModelV1StreamPart` format that the Vercel AI SDK expects.
 * @returns {TransformStream<Uint8Array, LanguageModelV1StreamPart>} A transform stream for processing API responses.
 */
export function createPromptrunStream(): TransformStream<
  Uint8Array,
  LanguageModelV1StreamPart
> {
  const textDecoder = new TextDecoder();

  let usage = {
    promptTokens: 0,
    completionTokens: 0,
  };

  let feed: (chunk: string) => void;

  return new TransformStream({
    start(controller) {
      const parser = createParser({
        onEvent: (event: EventSourceMessage) => {
          if (event.data === "" || event.data === null) {
            return;
          }
          if (event.data === "[DONE]") {
            return;
          }

          try {
            const parsedData = JSON.parse(event.data);

            if (parsedData.choices && parsedData.choices.length > 0) {
              const choice = parsedData.choices[0];

              if (choice.delta && choice.delta.content) {
                const textDelta = choice.delta.content;
                controller.enqueue({
                  type: "text-delta",
                  textDelta,
                } satisfies LanguageModelV1StreamPart);
              }

              if (choice.finish_reason) {
                const finishReason = choice.finish_reason as FinishReason;

                // Update usage if available
                if (parsedData.usage) {
                  usage = {
                    promptTokens: parsedData.usage.prompt_tokens || 0,
                    completionTokens: parsedData.usage.completion_tokens || 0,
                  };
                }

                controller.enqueue({
                  type: "finish",
                  finishReason,
                  usage,
                } satisfies LanguageModelV1StreamPart);
              }
            }
          } catch (error) {
            controller.enqueue({
              type: "error",
              error,
            } satisfies LanguageModelV1StreamPart);
          }
        },
      });

      feed = (chunk: string) => parser.feed(chunk);
    },

    transform(chunk) {
      feed(textDecoder.decode(chunk, { stream: true }));
    },
  });
}

/**
 * Parses and replaces variables in a prompt string.
 * Variables should be in the format {{variable_name}}.
 *
 * @param prompt The prompt string containing variables
 * @param variables Object containing variable values
 * @returns The prompt string with variables replaced
 */
export function parsePromptVariables(
  prompt: string,
  variables: Record<string, string | number | boolean>
): string {
  return prompt.replace(/\{\{(\w+)\}\}/g, (match, variableName) => {
    if (variableName in variables) {
      return String(variables[variableName]);
    }
    // If variable is not found, keep the original placeholder
    return match;
  });
}

/**
 * Extracts variable names from a prompt string.
 * Variables should be in the format {{variable_name}} or {{object.property}}.
 *
 * @param prompt The prompt string containing variables
 * @returns Array of variable names found in the prompt
 */
export function extractPromptVariables(prompt: string): string[] {
  const variableRegex = /\{\{([^}]+)\}\}/g;
  const variables: string[] = [];
  let match;

  while ((match = variableRegex.exec(prompt)) !== null) {
    const variableName = match[1];
    if (!variables.includes(variableName)) {
      variables.push(variableName);
    }
  }

  return variables;
}

/**
 * Validates inputs against a zod schema and returns the parsed data.
 * Throws an error if validation fails.
 *
 * @param inputs The input data to validate
 * @param schema The zod schema to validate against
 * @returns The parsed and validated data
 */
export function validateInputs<T>(
  inputs: Record<string, unknown>,
  schema: z.ZodSchema<T>
): T {
  return schema.parse(inputs);
}

/**
 * Processes a prompt with validated inputs, replacing variables.
 * Shows warnings for missing variables but allows continuation.
 * Supports nested object notation like user.name.
 *
 * @param prompt The prompt template
 * @param inputs The validated input variables
 * @param extractedVariables Array of variables found in the prompt
 * @returns The processed prompt with variables replaced
 */
export function processPromptWithInputs(
  prompt: string,
  inputs: Record<string, unknown>,
  extractedVariables: string[]
): string {
  let processedPrompt = prompt;
  const missingVariables: string[] = [];

  for (const variable of extractedVariables) {
    const value = getNestedValue(inputs, variable);
    if (value !== undefined) {
      processedPrompt = processedPrompt.replace(
        new RegExp(`\\{\\{${variable.replace(/\./g, "\\.")}\\}\\}`, "g"),
        String(value)
      );
    } else {
      missingVariables.push(variable);
    }
  }

  // Show warning for missing variables
  if (missingVariables.length > 0) {
    // eslint-disable-next-line no-console
    console.warn(
      `Warning: The following variables are defined in the prompt but not provided in inputs: ${missingVariables.join(
        ", "
      )}. Continuing with unprocessed variables.`
    );
  }

  return processedPrompt;
}

/**
 * Gets a nested value from an object using dot notation.
 * Example: getNestedValue({user: {name: 'John'}}, 'user.name') returns 'John'
 *
 * @param obj The object to search in
 * @param path The dot-separated path to the value
 * @returns The value at the path or undefined if not found
 */
function getNestedValue(obj: unknown, path: string): unknown {
  return path.split(".").reduce((current, key) => {
    return current &&
      typeof current === "object" &&
      current !== null &&
      key in current
      ? (current as Record<string, unknown>)[key]
      : undefined;
  }, obj);
}
