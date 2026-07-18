import { parsePort } from "@collage/config";
import { createLogger } from "@collage/logger";
import { createBotApp } from "./app.js";

const logger = createLogger("bot");
const port = parsePort(process.env.BOT_PORT, 4001);
const server = createBotApp().listen(port, "0.0.0.0", () => {
  logger.info({ port }, "Bot health service listening");
});

const shutdown = (signal: NodeJS.Signals): void => {
  logger.info({ signal }, "Bot shutdown requested");
  server.close((error) => {
    if (error !== undefined) {
      logger.error({ error }, "Bot shutdown failed");
      process.exitCode = 1;
    }
  });
};

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
