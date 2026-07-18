import { parsePort } from "@collage/config";
import { createLogger } from "@collage/logger";
import { createApiApp } from "./app.js";

const logger = createLogger("api");
const port = parsePort(process.env.API_PORT, 4000);
const server = createApiApp().listen(port, "0.0.0.0", () => {
  logger.info({ port }, "API health service listening");
});

const shutdown = (signal: NodeJS.Signals): void => {
  logger.info({ signal }, "API shutdown requested");
  server.close((error) => {
    if (error !== undefined) {
      logger.error({ error }, "API shutdown failed");
      process.exitCode = 1;
    }
  });
};

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
