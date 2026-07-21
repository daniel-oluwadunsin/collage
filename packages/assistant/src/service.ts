import { createHash } from "node:crypto";

import {
  assistantQueryRequestSchema,
  type AssistantQueryResponse,
} from "@collage/contracts";

import type { AssistantContextResolver } from "./context/assistant-context.js";
import { containsFirstPersonPronoun } from "./context/sanitize-message.js";
import {
  deterministicAssistantResponse,
  formatToolResult,
} from "./formatters/index.js";
import { AssistantProviderError } from "./groq/errors.js";
import {
  routeToolFamily,
  toolsForFamily,
  unsafeAssistantRequest,
} from "./groq/tool-router.js";
import type { GroqClient } from "./groq/client.js";
import { authorizeTool } from "./permissions/authorize-tool.js";
import { COLLAGE_ASSISTANT_SYSTEM_PROMPT } from "./prompts/system.js";
import { assistantToolCallSchema } from "./schemas/tool-call.js";
import type { AssistantToolExecutor } from "./tools/result.js";

export interface AssistantRateLimiter {
  consume(key: string, limit: number, windowSeconds: number): Promise<boolean>;
}
export interface AssistantAuditLogger {
  info(data: Readonly<Record<string, unknown>>, message: string): void;
  warn(data: Readonly<Record<string, unknown>>, message: string): void;
}

export interface AssistantServiceOptions {
  readonly enabled: boolean;
  readonly maxMessageLength: number;
  readonly maxToolCalls: number;
  readonly userRateLimitPerMinute: number;
  readonly chatRateLimitPerMinute: number;
  readonly contextResolver: AssistantContextResolver;
  readonly executor: AssistantToolExecutor;
  readonly groq: GroqClient;
  readonly limiter: AssistantRateLimiter;
  readonly logger: AssistantAuditLogger;
}

export class AssistantService {
  constructor(private readonly options: AssistantServiceOptions) {
    if (options.maxToolCalls !== 1)
      throw new Error("Collage assistant permits exactly one tool call");
  }

  async query(
    raw: unknown,
    requestId: string,
  ): Promise<AssistantQueryResponse> {
    const request = assistantQueryRequestSchema.parse(raw);
    const fallback = (
      kind: Parameters<typeof deterministicAssistantResponse>[0],
    ) =>
      deterministicAssistantResponse(
        kind,
        request.telegramMessageId,
        request.telegramMessageThreadId,
      );
    if (!this.options.enabled) return fallback("DISABLED");
    if (request.text.length > this.options.maxMessageLength)
      return fallback("CLARIFY");
    if (unsafeAssistantRequest(request.text)) return fallback("REFUSED");
    const [chatAllowed, userAllowed] = await Promise.all([
      this.options.limiter.consume(
        `assistant:chat:${safeReference(request.telegramChatId)}`,
        this.options.chatRateLimitPerMinute,
        60,
      ),
      request.actorTelegramUserId === undefined
        ? Promise.resolve(true)
        : this.options.limiter.consume(
            `assistant:user:${safeReference(request.actorTelegramUserId)}`,
            this.options.userRateLimitPerMinute,
            60,
          ),
    ]);
    if (!chatAllowed || !userAllowed) {
      this.options.logger.info(
        {
          requestId,
          outcome: "rate_limited",
          chatRef: safeReference(request.telegramChatId),
          chatAllowed,
          userAllowed,
        },
        "Assistant request rate limited",
      );
      return fallback("RATE_LIMIT");
    }
    const context = await this.options.contextResolver.resolve(
      request,
      requestId,
    );
    if (context.collage === null) return fallback("NO_COLLAGE");
    if (request.sentAnonymously && containsFirstPersonPronoun(request.text))
      return fallback("ANONYMOUS");
    const family = routeToolFamily(context.sanitizedText);
    const tools = toolsForFamily(
      family,
      context.sanitizedText,
      context.targetReferences.size > 0,
    );
    if (tools.length <= 2 && family === "UNKNOWN") return fallback("CLARIFY");
    try {
      const selected = await this.options.groq.selectTool({
        systemPrompt: COLLAGE_ASSISTANT_SYSTEM_PROMPT,
        text: context.sanitizedText,
        tools,
      });
      const call = assistantToolCallSchema.parse({
        name: selected.name,
        arguments: selected.arguments,
      });
      const exposed = new Set(tools.map((tool) => tool.function.name));
      if (!exposed.has(call.name))
        throw new AssistantProviderError("malformed");
      if (call.name === "request_clarification") return fallback("CLARIFY");
      if (call.name === "unsupported_question") return fallback("REFUSED");
      const authorization = authorizeTool(call, context);
      if (!authorization.authorized)
        return fallback(
          authorization.reason === "ANONYMOUS"
            ? "ANONYMOUS"
            : authorization.reason === "UNTRUSTED_TARGET"
              ? "CLARIFY"
              : "UNAUTHORIZED",
        );
      const started = performance.now();
      const result = await this.options.executor.execute(call, context);
      this.options.logger.info(
        {
          requestId,
          actorPublicId: context.actor?.publicId,
          chatRef: safeReference(request.telegramChatId),
          selectedTool: call.name,
          groqLatencyMs: selected.latencyMs,
          toolDurationMs: Math.round(performance.now() - started),
          rateLimitOutcome: "allowed",
          outcome: "success",
        },
        "Assistant tool executed",
      );
      return formatToolResult(
        result,
        request.telegramMessageId,
        request.telegramMessageThreadId,
      );
    } catch (error) {
      this.options.logger.warn(
        {
          requestId,
          errorKind:
            error instanceof AssistantProviderError ? error.kind : "internal",
          outcome: "unavailable",
        },
        "Assistant request failed safely",
      );
      return fallback("UNAVAILABLE");
    }
  }
}

const safeReference = (value: string): string =>
  createHash("sha256").update(value).digest("hex").slice(0, 16);
