import { LanguageModelV1StreamPart } from "@ai-sdk/provider";
import { FinishReason } from "ai";
import { createParser, EventSourceMessage } from "eventsource-parser";

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
