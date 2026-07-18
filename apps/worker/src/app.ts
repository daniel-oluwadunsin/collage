import type { HealthResponse } from "@collage/contracts";
import express, { type Express } from "express";

import type { WorkerMetrics } from "./metrics.js";

const health = (status: HealthResponse["status"]): HealthResponse => ({
  service: "worker",
  status,
  timestamp: new Date().toISOString(),
});

export interface WorkerHealth {
  readonly isReady: () => Promise<boolean>;
  readonly metrics?: WorkerMetrics;
}

export const createWorkerApp = (
  healthDependencies: WorkerHealth = {
    isReady: () => Promise.resolve(true),
  },
): Express => {
  const app = express();
  app.disable("x-powered-by");

  app.get("/health/live", (_request, response) => {
    response.status(200).json(health("ok"));
  });

  app.get("/health/ready", async (_request, response) => {
    const ready = await healthDependencies.isReady().catch(() => false);
    response.status(ready ? 200 : 503).json(health("ready"));
  });

  app.get("/metrics", (_request, response) => {
    response
      .status(200)
      .type("text/plain; version=0.0.4")
      .send(healthDependencies.metrics?.render() ?? "");
  });

  return app;
};
