import { z } from "zod";

import { AssistantProviderError } from "./errors.js";
import type { GroqToolDefinition } from "./tool-router.js";

const groqResponseSchema = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({
          tool_calls: z
            .array(
              z.object({
                function: z.object({ name: z.string(), arguments: z.string() }),
              }),
            )
            .optional(),
        }),
      }),
    )
    .min(1),
});

export interface GroqClientOptions {
  readonly apiKey: string;
  readonly model: string;
  readonly timeoutMilliseconds: number;
  readonly reasoningEffort: "none" | "low" | "medium" | "high";
  readonly fetchImplementation?: typeof fetch;
}

export class GroqClient {
  constructor(private readonly options: GroqClientOptions) {}

  async selectTool(input: {
    readonly systemPrompt: string;
    readonly text: string;
    readonly tools: readonly GroqToolDefinition[];
  }): Promise<{
    readonly name: string;
    readonly arguments: unknown;
    readonly latencyMs: number;
  }> {
    const started = performance.now();
    let response: Response;
    try {
      response = await (this.options.fetchImplementation ?? fetch)(
        "https://api.groq.com/openai/v1/chat/completions",
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${this.options.apiKey}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            model: this.options.model,
            messages: [
              { role: "system", content: input.systemPrompt },
              { role: "user", content: input.text },
            ],
            tools: input.tools,
            tool_choice: "required",
            parallel_tool_calls: false,
            reasoning_effort: this.options.reasoningEffort,
            temperature: 0,
            max_completion_tokens: 256,
          }),
          signal: AbortSignal.timeout(this.options.timeoutMilliseconds),
        },
      );
    } catch (error) {
      throw new AssistantProviderError(
        error instanceof DOMException && error.name === "TimeoutError"
          ? "timeout"
          : "unavailable",
        { cause: error },
      );
    }
    if (!response.ok) {
      throw new AssistantProviderError(
        response.status === 429
          ? "rate_limit"
          : response.status === 400
            ? "malformed"
            : "unavailable",
      );
    }
    try {
      const parsed = groqResponseSchema.parse(await response.json());
      const calls = parsed.choices[0]?.message.tool_calls ?? [];
      if (calls.length !== 1) throw new Error("Expected exactly one tool call");
      const call = calls[0];
      if (call === undefined) throw new Error("Missing tool call");
      return {
        name: call.function.name,
        arguments: JSON.parse(call.function.arguments) as unknown,
        latencyMs: Math.round(performance.now() - started),
      };
    } catch (error) {
      throw new AssistantProviderError("malformed", { cause: error });
    }
  }
}
