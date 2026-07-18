import { parsePort } from "@collage/config";
import { createLogger } from "@collage/logger";
import { createWorkerApp } from "./app.js";

const logger = createLogger("worker");
const port = parsePort(process.env.WORKER_HEALTH_PORT, 4002);
const server = createWorkerApp().listen(port, "0.0.0.0", () => {
  logger.info({ port }, "Worker health service listening");
});

const shutdown = (signal: NodeJS.Signals): void => {
  logger.info({ signal }, "Worker shutdown requested");
  server.close((error) => {
    if (error !== undefined) {
      logger.error({ error }, "Worker shutdown failed");
      process.exitCode = 1;
    }
  });
};

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
