import { parseEnvironment, workerEnvironmentSchema } from "@collage/config";
import { createLogger } from "@collage/logger";
import { createWorkerApp } from "./app.js";
import { createWorkerRuntime } from "./runtime.js";

const environment = parseEnvironment(workerEnvironmentSchema, process.env);
const logger = createLogger("worker", { level: environment.LOG_LEVEL });
const runtime = await createWorkerRuntime(environment);
const server = createWorkerApp({
  isReady: runtime.isReady,
  metrics: runtime.metrics,
}).listen(environment.WORKER_HEALTH_PORT, "0.0.0.0", () => {
  logger.info(
    { port: environment.WORKER_HEALTH_PORT },
    "Worker health service listening",
  );
});

let shuttingDown = false;
const shutdown = (signal: NodeJS.Signals): void => {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "Worker shutdown requested");
  server.close();
  void runtime
    .close()
    .catch((error: unknown) => {
      logger.error({ error }, "Worker shutdown failed");
      process.exitCode = 1;
    })
    .finally(() => {
      server.closeAllConnections();
    });
};

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
