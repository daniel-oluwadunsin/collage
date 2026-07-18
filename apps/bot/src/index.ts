import { botEnvironmentSchema, parseEnvironment } from "@collage/config";
import { createLogger } from "@collage/logger";
import { createRedisConnection } from "@collage/queue";

import { createBotApp } from "./app.js";
import { createCollageBot, TELEGRAM_ALLOWED_UPDATES } from "./bot.js";
import { SignedInternalTelegramClient } from "./internal-api.js";
import { createTelegramNotificationWorker } from "./notifications.js";

const environment = parseEnvironment(botEnvironmentSchema, process.env);
const logger = createLogger("bot");
const internalApi = new SignedInternalTelegramClient(
  environment.INTERNAL_API_URL,
  environment.INTERNAL_SERVICE_TOKEN,
  environment.BOT_INTERNAL_REQUEST_TIMEOUT_MS,
);
const redis = createRedisConnection(environment.REDIS_URL);
await redis.connect();

const bot = createCollageBot({
  token: environment.TELEGRAM_BOT_TOKEN,
  botUsername: environment.TELEGRAM_BOT_USERNAME,
  miniAppShortName: environment.TELEGRAM_MINI_APP_SHORT_NAME,
  internalApi,
  maxRateLimitRetries: environment.TELEGRAM_RATE_LIMIT_MAX_RETRIES,
  onError: (error) => logger.error({ error }, "Telegram update failed"),
});
await bot.init();
const expectedUsername = environment.TELEGRAM_BOT_USERNAME.replace(/^@/u, "");
if (bot.botInfo.username.toLowerCase() !== expectedUsername.toLowerCase()) {
  throw new Error("TELEGRAM_BOT_USERNAME does not match the configured token");
}

await bot.api.setMyCommands([
  { command: "collage", description: "Create or open this group's Collage" },
  { command: "status", description: "Refresh the current Collage status" },
  { command: "rules", description: "Review the current Collage rules" },
  { command: "help", description: "Show Collage bot help" },
]);
await bot.api.setWebhook(environment.TELEGRAM_WEBHOOK_PUBLIC_URL, {
  secret_token: environment.TELEGRAM_WEBHOOK_SECRET,
  allowed_updates: [...TELEGRAM_ALLOWED_UPDATES],
  drop_pending_updates: false,
});

const notificationWorker = createTelegramNotificationWorker({
  bot,
  internalApi,
  redis,
  concurrency: environment.TELEGRAM_NOTIFICATION_CONCURRENCY,
});
notificationWorker.on("failed", (job, error) => {
  logger.error(
    { deliveryId: job?.data.deliveryId, error },
    "Telegram notification delivery failed",
  );
});

const webhookPath = new URL(environment.TELEGRAM_WEBHOOK_PUBLIC_URL).pathname;
const app = createBotApp({
  bot,
  webhookPath,
  webhookSecret: environment.TELEGRAM_WEBHOOK_SECRET,
  readiness: async () =>
    redis.status === "ready" && (await internalApi.ready()),
});
const server = app.listen(environment.BOT_PORT, "0.0.0.0", () => {
  logger.info(
    {
      port: environment.BOT_PORT,
      webhookPath,
      allowedUpdates: TELEGRAM_ALLOWED_UPDATES,
    },
    "Telegram webhook bot listening",
  );
});

let shuttingDown = false;
const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "Bot shutdown requested");
  await Promise.all([
    notificationWorker.close(),
    new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error === undefined) resolve();
        else reject(error);
      });
    }),
  ]);
  await redis.quit();
};

const requestShutdown = (signal: NodeJS.Signals): void => {
  void shutdown(signal).catch((error: unknown) => {
    logger.error({ error, signal }, "Bot shutdown failed");
    process.exitCode = 1;
  });
};

process.once("SIGINT", () => requestShutdown("SIGINT"));
process.once("SIGTERM", () => requestShutdown("SIGTERM"));
