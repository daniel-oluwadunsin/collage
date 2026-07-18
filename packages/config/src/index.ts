import { z } from "zod";

const portSchema = z.coerce.number().int().min(1).max(65_535);

export const serviceEnvironmentSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace"])
    .default("info"),
});

export const parsePort = (
  value: string | undefined,
  fallback: number,
): number => portSchema.parse(value ?? fallback);
