import type { HealthResponse } from "@collage/contracts";
import express, { type Express } from "express";
import helmet from "helmet";

const health = (status: HealthResponse["status"]): HealthResponse => ({
  service: "api",
  status,
  timestamp: new Date().toISOString(),
});

export const createApiApp = (): Express => {
  const app = express();
  app.disable("x-powered-by");
  app.use(helmet());

  app.get("/health/live", (_request, response) => {
    response.status(200).json(health("ok"));
  });

  app.get("/health/ready", (_request, response) => {
    response.status(200).json(health("ready"));
  });

  return app;
};
