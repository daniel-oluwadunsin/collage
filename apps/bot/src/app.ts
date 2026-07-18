import { createHash, timingSafeEqual } from "node:crypto";

import type { HealthResponse } from "@collage/contracts";
import express, { type Express } from "express";
import { webhookCallback, type Bot } from "grammy";

const health = (status: HealthResponse["status"]): HealthResponse => ({
  service: "bot",
  status,
  timestamp: new Date().toISOString(),
});

export interface BotAppOptions {
  readonly bot: Bot;
  readonly webhookPath?: string;
  readonly webhookSecret: string;
  readonly readiness: () => Promise<boolean>;
}

export const createBotApp = (options: BotAppOptions): Express => {
  const app = express();
  app.disable("x-powered-by");

  app.get("/health/live", (_request, response) => {
    response.status(200).json(health("ok"));
  });

  app.get("/health/ready", async (_request, response, next) => {
    try {
      const ready = await options.readiness();
      response.status(ready ? 200 : 503).json(health(ready ? "ready" : "ok"));
    } catch (error) {
      next(error);
    }
  });

  app.post(
    options.webhookPath ?? "/telegram/webhook",
    express.json({ limit: "256kb", type: "application/json" }),
    (request, response, next) => {
      const supplied = request.get("x-telegram-bot-api-secret-token") ?? "";
      const expected = options.webhookSecret;
      const suppliedDigest = createHash("sha256").update(supplied).digest();
      const expectedDigest = createHash("sha256").update(expected).digest();
      if (!timingSafeEqual(suppliedDigest, expectedDigest)) {
        response.status(401).json({
          error: {
            code: "INVALID_TELEGRAM_WEBHOOK_SECRET",
            message: "Webhook authentication failed.",
          },
        });
        return;
      }
      next();
    },
    webhookCallback(options.bot, "express", {
      secretToken: options.webhookSecret,
      timeoutMilliseconds: 9_000,
      onTimeout: "throw",
    }),
  );

  app.use(
    (
      _error: unknown,
      _request: express.Request,
      response: express.Response,
      _next: express.NextFunction,
    ) => {
      response.status(500).json({
        error: { code: "INTERNAL_ERROR", message: "Request failed." },
      });
    },
  );
  return app;
};
