import { randomUUID } from "node:crypto";

import {
  AssistantService,
  GroqClient,
  type AssistantRateLimiter,
} from "@collage/assistant";

import { apiEnvironmentSchema, parseEnvironment } from "@collage/config";
import {
  checkDatabaseReadiness,
  createPrismaClient,
  PrismaLaunchTokenStore,
} from "@collage/database";
import { createLogger } from "@collage/logger";
import {
  MonnifyClient,
  type AccountValidation,
  type Bank,
  type CheckoutInitialization,
  type MandateResult,
  type TransactionVerification,
} from "@collage/monnify";
import {
  createQueue,
  createRedisConnection,
  deterministicJobId,
} from "@collage/queue";
import { LaunchTokenService, type ReplayStore } from "@collage/security";
import { SmsGateClient, SmsGateOtpProvider } from "@collage/smsgate";
import { z } from "zod";

import { createApiApp } from "./app.js";
import {
  PrismaAssistantContextResolver,
  PrismaAssistantToolExecutor,
} from "./assistant.js";
import {
  DatabaseWorkflowService,
  type OtpProvider,
  type ProviderPort,
  type TelegramMembershipPort,
} from "./database-workflow.js";
import { createInternalAuthenticator } from "./internal-auth.js";
import { SessionService } from "./session.js";
import { MonnifyWebhookIngress } from "./webhook-ingress.js";

const environment = parseEnvironment(apiEnvironmentSchema, process.env);
const logger = createLogger("api", { level: environment.LOG_LEVEL });
logger.info(
  {
    authenticationMode: environment.SMSGATE_AUTH_MODE,
    baseUrlHost: new URL(environment.SMSGATE_API_BASE_URL).host,
    deploymentMode: environment.SMSGATE_DEPLOYMENT_MODE,
    devicePinned: environment.SMSGATE_DEVICE_ID !== undefined,
    otpProvider: environment.OTP_PROVIDER,
    publicCloudProductionOverride:
      environment.SMSGATE_ALLOW_PUBLIC_CLOUD_IN_PRODUCTION,
  },
  "OTP provider configuration loaded",
);
const client = createPrismaClient(environment.DATABASE_URL);
const redis = createRedisConnection(environment.REDIS_URL);
const reminderQueue = createQueue("reminders", redis);

class RedisReplayStore implements ReplayStore {
  claim(key: string, expiresAt: Date): Promise<boolean> {
    const ttl = Math.max(1, expiresAt.getTime() - Date.now());
    return redis
      .set(`internal-auth:${key}`, "1", "PX", ttl, "NX")
      .then((result) => result === "OK");
  }
}

class RedisAssistantRateLimiter implements AssistantRateLimiter {
  consume(key: string, limit: number, windowSeconds: number): Promise<boolean> {
    return redis
      .eval(
        "local value = redis.call('INCR', KEYS[1]); if value == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]); end; return value <= tonumber(ARGV[2]) and 1 or 0",
        1,
        key,
        windowSeconds,
        limit,
      )
      .then((result) => result === 1);
  }
}

class DisabledProvider implements ProviderPort {
  private unavailable(): Promise<never> {
    return Promise.reject(new Error("Provider calls are disabled"));
  }

  createMandate(): Promise<MandateResult> {
    return this.unavailable();
  }

  getBanks(): Promise<readonly Bank[]> {
    return this.unavailable();
  }

  getMandateStatus(): Promise<MandateResult> {
    return this.unavailable();
  }

  initializeCheckout(): Promise<CheckoutInitialization> {
    return this.unavailable();
  }

  validateBankAccount(): Promise<AccountValidation> {
    return this.unavailable();
  }

  verifyTransactionByPaymentReference(): Promise<TransactionVerification> {
    return this.unavailable();
  }
}

class UnconfiguredOtpProvider implements OtpProvider {
  send(): Promise<{ readonly outcome: "queued" }> {
    return Promise.reject(
      new Error("Production OTP provider is not configured"),
    );
  }
}

class TelegramBotMembershipClient implements TelegramMembershipPort {
  constructor(private readonly botToken: string) {}

  async getMembership(
    telegramChatId: string,
    telegramUserId: string,
  ): ReturnType<TelegramMembershipPort["getMembership"]> {
    const response = await fetch(
      `https://api.telegram.org/bot${this.botToken}/getChatMember`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          chat_id: telegramChatId,
          user_id: telegramUserId,
        }),
        signal: AbortSignal.timeout(5_000),
      },
    );
    const envelope = z
      .object({
        ok: z.boolean(),
        result: z
          .object({
            status: z.string(),
            is_member: z.boolean().optional(),
          })
          .optional(),
      })
      .parse(await response.json());
    if (!response.ok || !envelope.ok || envelope.result === undefined) {
      return { active: false };
    }
    if (
      envelope.result.status === "restricted" &&
      envelope.result.is_member !== true
    ) {
      return { active: false };
    }
    const role = {
      member: "MEMBER",
      administrator: "ADMINISTRATOR",
      creator: "CREATOR",
      restricted: "RESTRICTED",
    }[envelope.result.status] as
      "MEMBER" | "ADMINISTRATOR" | "CREATOR" | "RESTRICTED" | undefined;
    return role === undefined ? { active: false } : { active: true, role };
  }
}

const sessions = new SessionService(
  Buffer.from(environment.API_SESSION_SECRET, "utf8"),
);
const encryption = {
  activeKeyId: environment.APP_ENCRYPTION_KEY_ID,
  keys: {
    [environment.APP_ENCRYPTION_KEY_ID]: Buffer.from(
      environment.APP_ENCRYPTION_KEY_BASE64,
      "base64",
    ),
  },
};
const monnify: ProviderPort = environment.PROVIDER_CALLS_ENABLED
  ? new MonnifyClient({
      apiKey: environment.MONNIFY_API_KEY,
      baseUrl: environment.MONNIFY_BASE_URL,
      contractCode: environment.MONNIFY_CONTRACT_CODE,
      secretKey: environment.MONNIFY_SECRET_KEY,
      ...(environment.MONNIFY_DISBURSEMENT_WALLET_ACCOUNT_NUMBER === undefined
        ? {}
        : {
            sourceWalletAccountNumber:
              environment.MONNIFY_DISBURSEMENT_WALLET_ACCOUNT_NUMBER,
          }),
    })
  : new DisabledProvider();
const launchTokens = new LaunchTokenService(
  new PrismaLaunchTokenStore(client),
  Buffer.from(environment.LAUNCH_TOKEN_HASH_SECRET, "utf8"),
);
const assistant = new AssistantService({
  enabled: environment.ASSISTANT_ENABLED,
  maxMessageLength: environment.ASSISTANT_MAX_MESSAGE_LENGTH,
  maxToolCalls: environment.GROQ_MAX_TOOL_CALLS,
  userRateLimitPerMinute: environment.ASSISTANT_USER_RATE_LIMIT_PER_MINUTE,
  chatRateLimitPerMinute: environment.ASSISTANT_CHAT_RATE_LIMIT_PER_MINUTE,
  contextResolver: new PrismaAssistantContextResolver(client),
  executor: new PrismaAssistantToolExecutor({
    client,
    encryption,
    launchTokens,
    botUsername: environment.TELEGRAM_BOT_USERNAME,
    miniAppShortName: environment.TELEGRAM_MINI_APP_SHORT_NAME,
  }),
  groq: new GroqClient({
    apiKey: environment.GROQ_API_KEY,
    model: environment.GROQ_MODEL,
    timeoutMilliseconds: environment.GROQ_TIMEOUT_MS,
    reasoningEffort: environment.GROQ_REASONING_EFFORT,
  }),
  limiter: new RedisAssistantRateLimiter(),
  logger,
});
const otp: OtpProvider =
  environment.OTP_PROVIDER === "smsgate"
    ? new SmsGateOtpProvider(
        new SmsGateClient({
          apiBaseUrl: environment.SMSGATE_API_BASE_URL,
          authenticationMode: environment.SMSGATE_AUTH_MODE,
          deploymentMode: environment.SMSGATE_DEPLOYMENT_MODE,
          password: environment.SMSGATE_PASSWORD,
          tokenTtlSeconds: environment.SMSGATE_TOKEN_TTL_SECONDS,
          timeoutMilliseconds: environment.SMSGATE_REQUEST_TIMEOUT_MS,
          username: environment.SMSGATE_USERNAME,
        }),
        {
          ...(environment.SMSGATE_DEVICE_ID === undefined
            ? {}
            : { deviceId: environment.SMSGATE_DEVICE_ID }),
          priority: environment.SMSGATE_PRIORITY,
          simNumber: environment.SMSGATE_SIM_NUMBER,
          withDeliveryReport: true,
        },
      )
    : new UnconfiguredOtpProvider();
const workflow = new DatabaseWorkflowService({
  client,
  encryption,
  hashKey: Buffer.from(environment.APP_HASH_PEPPER, "utf8"),
  launchTokens,
  logger,
  miniAppUrl: environment.MINI_APP_PUBLIC_URL,
  monnify,
  otp,
  otpTtlSeconds: environment.OTP_TTL_SECONDS,
  providerCallsEnabled: environment.PROVIDER_CALLS_ENABLED,
  providerEnvironment: environment.MONNIFY_ENV,
  publicUrl: environment.API_PUBLIC_URL,
  sessions,
  telegramBotToken: environment.TELEGRAM_BOT_TOKEN,
  telegramInitDataMaxAgeSeconds: environment.TELEGRAM_INIT_DATA_MAX_AGE_SECONDS,
  telegramMembership: new TelegramBotMembershipClient(
    environment.TELEGRAM_BOT_TOKEN,
  ),
});
const webhookIngress =
  environment.MONNIFY_SECRET_KEY.length === 0
    ? undefined
    : new MonnifyWebhookIngress({
        client,
        encryption,
        environment: environment.MONNIFY_ENV,
        secretKey: environment.MONNIFY_SECRET_KEY,
        allowUnsignedSandbox:
          environment.MONNIFY_ALLOW_UNSIGNED_SANDBOX_WEBHOOKS,
        allowedProductionIps: new Set(
          environment.MONNIFY_WEBHOOK_ALLOWED_IPS.split(",")
            .map((value) => value.trim())
            .filter((value) => value.length > 0),
        ),
      });

const app = createApiApp({
  assistantQuery: (input, requestId) => assistant.query(input, requestId),
  allowedOrigins: [
    ...environment.CORS_ALLOWED_ORIGINS.split(",").map((value) => value.trim()),
    "https://legendary-chebakia-d13414.netlify.app",
  ],
  internalAuthenticate: createInternalAuthenticator(
    Buffer.from(environment.INTERNAL_SERVICE_TOKEN, "utf8"),
    new RedisReplayStore(),
  ),
  logger,
  readiness: async () => {
    await checkDatabaseReadiness(client);
    await redis.ping();
    return true;
  },
  sessionService: sessions,
  workflow,
  ...(environment.DEMO_CONTROLS_ENABLED
    ? {
        demoControls: {
          token: environment.DEMO_CONTROL_TOKEN,
          triggerReminders: async () => {
            const cycles = await client.cycle.findMany({
              where: {
                state: { in: ["COLLECTING", "OVERDUE"] },
                contributions: { some: { state: { not: "PAID" } } },
              },
              select: { id: true },
              take: 500,
            });
            const triggeredAt = new Date();
            const triggerId = randomUUID();
            await Promise.all(
              cycles.map((cycle) =>
                reminderQueue.add(
                  "demo-cycle-reminder",
                  {
                    cycleId: cycle.id,
                    scheduledFor: triggeredAt.toISOString(),
                  },
                  {
                    jobId: deterministicJobId(
                      "demo-reminder",
                      cycle.id,
                      triggerId,
                    ),
                  },
                ),
              ),
            );
            logger.info(
              {
                eligibleCycles: cycles.length,
                triggerId,
              },
              "Demo reminders queued",
            );
            return {
              eligibleCycles: cycles.length,
              queuedReminders: cycles.length,
            };
          },
        },
      }
    : {}),
  ...(webhookIngress === undefined ? {} : { webhookIngress }),
});

const server = app.listen(environment.API_PORT, "0.0.0.0", () => {
  logger.info({ port: environment.API_PORT }, "API listening");
});

const shutdown = (signal: NodeJS.Signals): void => {
  logger.info({ signal }, "API shutdown requested");
  server.close((error) => {
    void Promise.allSettled([
      reminderQueue.close(),
      client.$disconnect(),
      redis.quit(),
    ]).then(() => {
      if (error !== undefined) {
        logger.error({ error }, "API shutdown failed");
        process.exitCode = 1;
      }
    });
  });
};

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
