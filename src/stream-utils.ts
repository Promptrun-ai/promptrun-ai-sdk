import { LanguageModelV1StreamPart } from "@ai-sdk/provider";
import { FinishReason } from "ai";
import { createParser, EventSourceMessage } from "eventsource-parser";
import { z } from "zod";

/**
 * Creates a transform stream that processes Promptrun API responses
 * into the `LanguageModelV1StreamPart` format that the Vercel AI SDK expects.
 *
 * This function creates a `TransformStream` that:
 * - Parses Server-Sent Events (SSE) from the Promptrun API
 * - Extracts text deltas and completion information
 * - Formats the data according to the Vercel AI SDK's expected structure
 * - Handles usage statistics and finish reasons
 *
 * The stream processes the raw API response and emits structured parts that
 * can be consumed by the AI SDK's streaming functions.
 *
 * @returns {TransformStream<Uint8Array, LanguageModelV1StreamPart>} A transform stream for processing API responses
 *
 * @example
 * ```typescript
 * const response = await fetch("https://your-api-endpoint.com/v1/chat/completions", {
 *   method: "POST",
 *   body: JSON.stringify({ model: "openai/gpt-4o", messages: [...] })
 * });
 *
 * const stream = response.body.pipeThrough(createPromptrunStream());
 *
 * for await (const part of asAsyncIterable(stream)) {
 *   if (part.type === "text-delta") {
 *     console.log(part.textDelta); // Accumulate text
 *   } else if (part.type === "finish") {
 *     console.log("Generation complete:", part.finishReason);
 *     console.log("Usage:", part.usage);
 *   }
 * }
 * ```
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
 *
 * This function replaces variables in the format `{{variable_name}}` with their
 * corresponding values from the provided variables object. If a variable is not
 * found in the variables object, the original placeholder is kept unchanged.
 *
 * @param {string} prompt - The prompt string containing variables in `{{variable_name}}` format
 * @param {Record<string, string | number | boolean>} variables - Object containing variable values
 * @returns {string} The prompt string with variables replaced
 *
 * @example
 * ```typescript
 * const prompt = "Hello {{name}}, you are {{age}} years old.";
 * const variables = { name: "John", age: 30 };
 *
 * const result = parsePromptVariables(prompt, variables);
 * console.log(result); // "Hello John, you are 30 years old."
 *
 * // Missing variables are preserved
 * const prompt2 = "Hello {{name}}, your role is {{role}}.";
 * const variables2 = { name: "Alice" };
 *
 * const result2 = parsePromptVariables(prompt2, variables2);
 * console.log(result2); // "Hello Alice, your role is {{role}}."
 * ```
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
 *
 * This function finds all variables in the format `{{variable_name}}` or
 * `{{object.property}}` and returns them as an array of unique variable names.
 * The function supports nested object notation using dot notation.
 *
 * @param {string} prompt - The prompt string containing variables
 * @returns {string[]} Array of unique variable names found in the prompt
 *
 * @example
 * ```typescript
 * const prompt = "Hello {{name}}, your email is {{user.email}} and age is {{age}}.";
 *
 * const variables = extractPromptVariables(prompt);
 * console.log(variables); // ["name", "user.email", "age"]
 *
 * // Handles duplicate variables
 * const prompt2 = "{{name}} says hello to {{name}}";
 * const variables2 = extractPromptVariables(prompt2);
 * console.log(variables2); // ["name"] (duplicates removed)
 * ```
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
 * Validates inputs against a Zod schema and returns the parsed data.
 *
 * This function uses Zod to validate input data against a provided schema.
 * If validation fails, it throws a Zod error with details about what went wrong.
 * If validation succeeds, it returns the parsed and validated data.
 *
 * @template T The type that the schema validates to
 * @param {Record<string, unknown>} inputs - The input data to validate
 * @param {z.ZodSchema<T>} schema - The Zod schema to validate against
 * @returns {T} The parsed and validated data
 * @throws {z.ZodError} When validation fails
 *
 * @example
 * ```typescript
 * import { z } from 'zod';
 *
 * const schema = z.object({
 *   name: z.string().min(1),
 *   age: z.number().min(0).max(120),
 *   email: z.string().email()
 * });
 *
 * const inputs = {
 *   name: "John Doe",
 *   age: 30,
 *   email: "john@example.com"
 * };
 *
 * try {
 *   const validated = validateInputs(inputs, schema);
 *   console.log(validated); // { name: "John Doe", age: 30, email: "john@example.com" }
 * } catch (error) {
 *   console.error("Validation failed:", error.message);
 * }
 *
 * // Invalid inputs will throw
 * const invalidInputs = { name: "", age: -5, email: "invalid-email" };
 * validateInputs(invalidInputs, schema); // Throws ZodError
 * ```
 */
export function validateInputs<T>(
  inputs: Record<string, unknown>,
  schema: z.ZodSchema<T>
): T {
  return schema.parse(inputs);
}

/**
 * Processes a prompt with validated inputs, replacing variables.
 *
 * This function takes a prompt template, validated input variables, and a list
 * of extracted variables, then replaces all variables in the prompt with their
 * corresponding values. It supports nested object notation (e.g., `user.name`)
 * and provides warnings for missing variables while allowing the process to continue.
 *
 * The function uses `getNestedValue` internally to handle nested object access
 * and provides console warnings when variables are defined in the prompt but
 * not provided in the inputs.
 *
 * @param {string} prompt - The prompt template containing variables
 * @param {Record<string, unknown>} inputs - The validated input variables
 * @param {string[]} extractedVariables - Array of variables found in the prompt
 * @returns {string} The processed prompt with variables replaced
 *
 * @example
 * ```typescript
 * const prompt = "Hello {{name}}, your email is {{user.email}} and age is {{age}}.";
 * const inputs = {
 *   name: "John",
 *   user: { email: "john@example.com" },
 *   // age is missing
 * };
 * const extractedVariables = ["name", "user.email", "age"];
 *
 * const result = processPromptWithInputs(prompt, inputs, extractedVariables);
 * console.log(result); // "Hello John, your email is john@example.com and age is {{age}}."
 * // Console warning: "Warning: The following variables are defined in the prompt but not provided in inputs: age"
 *
 * // With all variables provided
 * const inputs2 = {
 *   name: "Alice",
 *   user: { email: "alice@example.com" },
 *   age: 25
 * };
 *
 * const result2 = processPromptWithInputs(prompt, inputs2, extractedVariables);
 * console.log(result2); // "Hello Alice, your email is alice@example.com and age is 25."
 * ```
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
 *
 * This utility function allows accessing nested object properties using dot notation
 * (e.g., "user.name" to access `obj.user.name`). It safely handles cases where
 * intermediate properties might not exist and returns `undefined` if the path
 * cannot be resolved.
 *
 * @param {unknown} obj - The object to search in
 * @param {string} path - The dot-separated path to the value (e.g., "user.name", "settings.theme.color")
 * @returns {unknown} The value at the path or undefined if not found
 *
 * @example
 * ```typescript
 * const obj = {
 *   user: {
 *     name: "John",
 *     profile: {
 *       age: 30,
 *       email: "john@example.com"
 *     }
 *   },
 *   settings: {
 *     theme: "dark"
 *   }
 * };
 *
 * console.log(getNestedValue(obj, "user.name")); // "John"
 * console.log(getNestedValue(obj, "user.profile.age")); // 30
 * console.log(getNestedValue(obj, "settings.theme")); // "dark"
 * console.log(getNestedValue(obj, "user.profile.address")); // undefined
 * console.log(getNestedValue(obj, "nonexistent.path")); // undefined
 *
 * // Works with arrays and other types
 * const obj2 = {
 *   items: ["apple", "banana"],
 *   config: { enabled: true }
 * };
 *
 * console.log(getNestedValue(obj2, "items.0")); // "apple"
 * console.log(getNestedValue(obj2, "config.enabled")); // true
 * ```
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
