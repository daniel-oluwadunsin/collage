import {
  Prisma,
  type PrismaClient,
  withSerializableTransaction,
} from "@collage/database";
import {
  fingerprintMonnifyWebhook,
  normalizeMonnifyWebhook,
  validateMonnifyWebhook,
} from "@collage/monnify";
import { encryptString, type EncryptionKeyring } from "@collage/security";

import { ApiError } from "./errors.js";
import type { WebhookIngress } from "./app.js";

export interface MonnifyWebhookIngressOptions {
  readonly allowedProductionIps: ReadonlySet<string>;
  readonly allowUnsignedSandbox: boolean;
  readonly client: PrismaClient;
  readonly encryption: EncryptionKeyring;
  readonly environment: "production" | "sandbox";
  readonly secretKey: string;
}

const normalizeIp = (ip: string): string =>
  ip.startsWith("::ffff:") ? ip.slice(7) : ip;

export class MonnifyWebhookIngress implements WebhookIngress {
  constructor(private readonly options: MonnifyWebhookIngressOptions) {}

  async ingest(
    rawBody: Buffer,
    input: {
      readonly ip: string;
      readonly requestId: string;
      readonly signature?: string;
    },
  ): Promise<{ readonly duplicate: boolean }> {
    if (
      this.options.environment === "production" &&
      !this.options.allowedProductionIps.has(normalizeIp(input.ip))
    ) {
      throw new ApiError(
        401,
        "WEBHOOK_SOURCE_REJECTED",
        "Webhook source is not allowed.",
      );
    }
    const signatureValid =
      this.options.environment === "sandbox"
        ? validateMonnifyWebhook(rawBody, {
            environment: "sandbox",
            secretKey: this.options.secretKey,
            signature: input.signature,
            allowUnsignedSandbox: this.options.allowUnsignedSandbox,
          })
        : validateMonnifyWebhook(rawBody, {
            environment: "production",
            secretKey: this.options.secretKey,
            signature: input.signature,
          });
    if (!signatureValid) {
      throw new ApiError(
        401,
        "WEBHOOK_SIGNATURE_INVALID",
        "Webhook signature is invalid.",
      );
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawBody.toString("utf8"));
    } catch {
      throw new ApiError(
        400,
        "WEBHOOK_PAYLOAD_INVALID",
        "Webhook payload is invalid.",
      );
    }
    const normalized = normalizeMonnifyWebhook(parsed);
    const fingerprint = fingerprintMonnifyWebhook(rawBody);
    try {
      await withSerializableTransaction(
        this.options.client,
        async (transaction) => {
          const event = await transaction.webhookEvent.create({
            data: {
              provider: "MONNIFY",
              providerEnvironment: this.options.environment,
              providerEventId: normalized.providerEventId ?? null,
              fingerprint,
              eventType: normalized.eventType,
              signatureValid,
              payloadEncrypted: encryptString(
                rawBody.toString("utf8"),
                this.options.encryption,
                `webhook:monnify:${fingerprint}`,
              ),
            },
          });
          await transaction.outboxEvent.create({
            data: {
              eventType: "monnify.webhook.received",
              aggregateType: "webhook-event",
              aggregateId: event.id,
              aggregateVersion: 1,
              correlationId: input.requestId,
              payload: { webhookEventId: event.id },
            },
          });
        },
      );
      return { duplicate: false };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        return { duplicate: true };
      }
      throw error;
    }
  }
}
