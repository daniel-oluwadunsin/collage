import { z } from "zod";

const portSchema = z.coerce.number().int().min(1).max(65_535);
const urlSchema = z.url();
const secretSchema = z.string().min(32);
const encryptionKeySchema = z.string().refine((value) => {
  try {
    return Buffer.from(value, "base64").byteLength === 32;
  } catch {
    return false;
  }
}, "must be a base64-encoded 32-byte key");

export const serviceEnvironmentSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace"])
    .default("info"),
});

const persistenceEnvironmentSchema = z.object({
  DATABASE_URL: urlSchema,
  REDIS_URL: urlSchema,
});

const cryptographyEnvironmentSchema = z.object({
  APP_ENCRYPTION_KEY_ID: z.string().min(1),
  APP_ENCRYPTION_KEY_BASE64: encryptionKeySchema,
  APP_HASH_PEPPER: secretSchema,
  INTERNAL_SERVICE_TOKEN: secretSchema,
  LAUNCH_TOKEN_HASH_SECRET: secretSchema,
});

const providerSwitchSchema = z.object({
  PROVIDER_CALLS_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
});

export const apiEnvironmentSchema = serviceEnvironmentSchema
  .extend({
    API_PORT: portSchema.default(4000),
    API_PUBLIC_URL: urlSchema,
    TELEGRAM_BOT_TOKEN: z.string().min(10),
  })
  .and(persistenceEnvironmentSchema)
  .and(cryptographyEnvironmentSchema)
  .and(providerSwitchSchema);

export const botEnvironmentSchema = serviceEnvironmentSchema
  .extend({
    BOT_PORT: portSchema.default(4001),
    INTERNAL_API_URL: urlSchema,
    TELEGRAM_BOT_TOKEN: z.string().min(10),
  })
  .and(persistenceEnvironmentSchema.pick({ REDIS_URL: true }))
  .and(cryptographyEnvironmentSchema.pick({ INTERNAL_SERVICE_TOKEN: true }))
  .and(providerSwitchSchema);

export const workerEnvironmentSchema = serviceEnvironmentSchema
  .extend({
    WORKER_HEALTH_PORT: portSchema.default(4002),
  })
  .and(persistenceEnvironmentSchema)
  .and(cryptographyEnvironmentSchema)
  .and(providerSwitchSchema);

export const miniAppEnvironmentSchema = serviceEnvironmentSchema.extend({
  PORT: portSchema.default(3000),
  NEXT_PUBLIC_API_URL: urlSchema,
});

export const parseEnvironment = <Output>(
  schema: z.ZodType<Output>,
  environment: Readonly<Record<string, string | undefined>>,
): Output => schema.parse(environment);

export const parsePort = (
  value: string | undefined,
  fallback: number,
): number => portSchema.parse(value ?? fallback);
