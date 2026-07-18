import type { HealthResponse } from "@collage/contracts";
import express, { type Express } from "express";

const health = (status: HealthResponse["status"]): HealthResponse => ({
  service: "worker",
  status,
  timestamp: new Date().toISOString(),
});

export const createWorkerApp = (): Express => {
  const app = express();
  app.disable("x-powered-by");

  app.get("/health/live", (_request, response) => {
    response.status(200).json(health("ok"));
  });

  app.get("/health/ready", (_request, response) => {
    response.status(200).json(health("ready"));
  });

  return app;
};
