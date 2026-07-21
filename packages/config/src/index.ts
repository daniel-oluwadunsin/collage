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

const smsGateEnvironmentSchema = z.object({
  OTP_PROVIDER: z.enum(["unconfigured", "smsgate"]).default("unconfigured"),
  OTP_TTL_SECONDS: z.coerce.number().int().min(30).max(3_600).default(600),
  SMSGATE_API_BASE_URL: urlSchema.default(
    "https://api.sms-gate.app/3rdparty/v1",
  ),
  SMSGATE_DEPLOYMENT_MODE: z
    .enum(["cloud", "local", "private"])
    .default("cloud"),
  SMSGATE_AUTH_MODE: z.enum(["basic", "jwt"]).default("jwt"),
  SMSGATE_USERNAME: z.string().default(""),
  SMSGATE_PASSWORD: z.string().default(""),
  SMSGATE_DEVICE_ID: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().min(1).max(21).optional(),
  ),
  SMSGATE_SIM_NUMBER: z.coerce.number().int().min(1).max(3).default(1),
  SMSGATE_PRIORITY: z.coerce.number().int().min(-128).max(127).default(100),
  SMSGATE_REQUEST_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(1_000)
    .max(60_000)
    .default(10_000),
  SMSGATE_TOKEN_TTL_SECONDS: z.coerce.number().int().min(300),
});

export const apiEnvironmentSchema = serviceEnvironmentSchema
  .extend({
    API_PORT: portSchema.default(4000),
    API_PUBLIC_URL: urlSchema,
    API_SESSION_SECRET: secretSchema,
    CORS_ALLOWED_ORIGINS: z.string().min(1),
    MINI_APP_PUBLIC_URL: urlSchema,
    TELEGRAM_BOT_TOKEN: z.string().min(10),
    TELEGRAM_INIT_DATA_MAX_AGE_SECONDS: z.coerce.number().int().min(300),
    MONNIFY_ENV: z.enum(["sandbox", "production"]).default("sandbox"),
    MONNIFY_BASE_URL: urlSchema,
    MONNIFY_API_KEY: z.string(),
    MONNIFY_SECRET_KEY: z.string(),
    MONNIFY_CONTRACT_CODE: z.string(),
    MONNIFY_DISBURSEMENT_WALLET_ACCOUNT_NUMBER: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.string().min(1).optional(),
    ),
    MONNIFY_WEBHOOK_ALLOWED_IPS: z.string().default("35.242.133.146"),
    MONNIFY_ALLOW_UNSIGNED_SANDBOX_WEBHOOKS: z
      .enum(["true", "false"])
      .default("false")
      .transform((value) => value === "true"),
    DEMO_CONTROLS_ENABLED: z
      .enum(["true", "false"])
      .default("false")
      .transform((value) => value === "true"),
    DEMO_CONTROL_TOKEN: z.string().default(""),
  })
  .and(persistenceEnvironmentSchema)
  .and(cryptographyEnvironmentSchema)
  .and(providerSwitchSchema)
  .and(smsGateEnvironmentSchema)
  .superRefine((value, context) => {
    if (value.DEMO_CONTROLS_ENABLED && value.DEMO_CONTROL_TOKEN.length < 32) {
      context.addIssue({
        code: "custom",
        message:
          "DEMO_CONTROL_TOKEN must contain at least 32 characters when demo controls are enabled",
      });
    }
    if (
      value.PROVIDER_CALLS_ENABLED &&
      [
        value.MONNIFY_API_KEY,
        value.MONNIFY_SECRET_KEY,
        value.MONNIFY_CONTRACT_CODE,
      ].some((secret) => secret.length === 0)
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Monnify credentials are required when provider calls are enabled",
      });
    }
    if (
      value.MONNIFY_ENV === "production" &&
      value.MONNIFY_SECRET_KEY.length === 0
    ) {
      context.addIssue({
        code: "custom",
        message: "Monnify secret is required for production webhook validation",
      });
    }
    if (
      value.OTP_PROVIDER === "smsgate" &&
      (value.SMSGATE_USERNAME.length === 0 ||
        value.SMSGATE_PASSWORD.length === 0)
    ) {
      context.addIssue({
        code: "custom",
        message: "SMSGate credentials are required when SMSGate OTP is enabled",
      });
    }
    if (
      value.OTP_PROVIDER === "smsgate" &&
      value.SMSGATE_DEPLOYMENT_MODE === "local" &&
      value.SMSGATE_AUTH_MODE !== "basic"
    ) {
      context.addIssue({
        code: "custom",
        message: "SMSGate Local Server requires Basic authentication",
      });
    }
    if (
      value.OTP_PROVIDER === "smsgate" &&
      value.SMSGATE_DEPLOYMENT_MODE === "private" &&
      new URL(value.SMSGATE_API_BASE_URL).hostname === "api.sms-gate.app"
    ) {
      context.addIssue({
        code: "custom",
        message:
          "SMSGate private deployment cannot use the public-cloud API host",
      });
    }
    if (
      value.NODE_ENV === "production" &&
      value.OTP_PROVIDER === "smsgate" &&
      value.SMSGATE_DEPLOYMENT_MODE !== "private"
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Production Collage OTP requires SMSGate private-server deployment mode",
      });
    }
    if (
      value.NODE_ENV === "production" &&
      value.OTP_PROVIDER === "smsgate" &&
      new URL(value.SMSGATE_API_BASE_URL).protocol !== "https:"
    ) {
      context.addIssue({
        code: "custom",
        message: "Production SMSGate requires HTTPS",
      });
    }
  });

export const botEnvironmentSchema = serviceEnvironmentSchema
  .extend({
    BOT_PORT: portSchema.default(4001),
    INTERNAL_API_URL: urlSchema,
    TELEGRAM_BOT_TOKEN: z.string().min(10),
    TELEGRAM_BOT_USERNAME: z.string().regex(/^@?[A-Za-z0-9_]{5,64}$/u),
    TELEGRAM_MINI_APP_SHORT_NAME: z.string().regex(/^[A-Za-z0-9_]{1,64}$/u),
    TELEGRAM_WEBHOOK_SECRET: z
      .string()
      .min(32)
      .max(256)
      .regex(/^[A-Za-z0-9_-]+$/u),
    TELEGRAM_WEBHOOK_PUBLIC_URL: urlSchema.refine(
      (value) => new URL(value).protocol === "https:",
      "Telegram webhook URL must use HTTPS",
    ),
    BOT_INTERNAL_REQUEST_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(500)
      .max(30_000)
      .default(5_000),
    TELEGRAM_NOTIFICATION_CONCURRENCY: z.coerce
      .number()
      .int()
      .min(1)
      .max(50)
      .default(10),
    TELEGRAM_RATE_LIMIT_MAX_RETRIES: z.coerce
      .number()
      .int()
      .min(0)
      .max(5)
      .default(2),
  })
  .and(persistenceEnvironmentSchema.pick({ REDIS_URL: true }))
  .and(cryptographyEnvironmentSchema.pick({ INTERNAL_SERVICE_TOKEN: true }))
  .and(providerSwitchSchema);

export const workerEnvironmentSchema = serviceEnvironmentSchema
  .extend({
    WORKER_HEALTH_PORT: portSchema.default(4002),
    MONNIFY_ENV: z.enum(["sandbox", "production"]).default("sandbox"),
    MONNIFY_BASE_URL: urlSchema,
    MONNIFY_API_KEY: z.string(),
    MONNIFY_SECRET_KEY: z.string(),
    MONNIFY_CONTRACT_CODE: z.string(),
    MONNIFY_DISBURSEMENT_WALLET_ACCOUNT_NUMBER: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.string().min(1).optional(),
    ),
    API_PUBLIC_URL: urlSchema,
    MINI_APP_PUBLIC_URL: urlSchema,
    HACKATHON_DEMO_MODE: z
      .enum(["true", "false"])
      .default("false")
      .transform((value) => value === "true"),
    WORKER_MAX_AUTOMATIC_CHARGE_ATTEMPTS: z.coerce
      .number()
      .int()
      .min(1)
      .max(10)
      .default(3),
    WORKER_PENDING_POLL_SECONDS: z.coerce
      .number()
      .int()
      .min(15)
      .max(3_600)
      .default(60),
    WORKER_STALE_OPERATION_MINUTES: z.coerce
      .number()
      .int()
      .min(1)
      .max(1_440)
      .default(15),
    WORKER_OUTBOX_CONCURRENCY: z.coerce.number().int().min(1).max(4).default(1),
    WORKER_LIFECYCLE_CONCURRENCY: z.coerce
      .number()
      .int()
      .min(1)
      .max(20)
      .default(4),
    WORKER_PAYMENT_CONCURRENCY: z.coerce
      .number()
      .int()
      .min(1)
      .max(50)
      .default(10),
    WORKER_PAYOUT_CONCURRENCY: z.coerce
      .number()
      .int()
      .min(1)
      .max(10)
      .default(2),
    WORKER_REMINDER_CONCURRENCY: z.coerce
      .number()
      .int()
      .min(1)
      .max(10)
      .default(2),
  })
  .and(persistenceEnvironmentSchema)
  .and(cryptographyEnvironmentSchema)
  .and(providerSwitchSchema)
  .superRefine((value, context) => {
    if (value.HACKATHON_DEMO_MODE && value.MONNIFY_ENV !== "sandbox") {
      context.addIssue({
        code: "custom",
        message:
          "Hackathon demo mode is restricted to Monnify sandbox deployments",
      });
    }
    if (
      value.PROVIDER_CALLS_ENABLED &&
      ([
        value.MONNIFY_API_KEY,
        value.MONNIFY_SECRET_KEY,
        value.MONNIFY_CONTRACT_CODE,
      ].some((credential) => credential.length === 0) ||
        value.MONNIFY_DISBURSEMENT_WALLET_ACCOUNT_NUMBER === undefined)
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Monnify credentials are required when worker provider calls are enabled",
      });
    }
  });

export type WorkerEnvironment = z.output<typeof workerEnvironmentSchema>;

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
