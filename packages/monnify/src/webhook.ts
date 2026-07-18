import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import { z } from "zod";

export type MonnifyWebhookPolicy =
  | {
      readonly environment: "production";
      readonly secretKey: string;
      readonly signature: string | undefined;
    }
  | {
      readonly allowUnsignedSandbox: boolean;
      readonly environment: "sandbox";
      readonly secretKey: string;
      readonly signature: string | undefined;
    };

export const validateMonnifyWebhook = (
  rawBody: Buffer,
  policy: MonnifyWebhookPolicy,
): boolean => {
  if (policy.environment === "sandbox" && policy.signature === undefined) {
    return policy.allowUnsignedSandbox;
  }
  if (
    policy.signature === undefined ||
    !/^[\da-f]{128}$/iu.test(policy.signature)
  ) {
    return false;
  }
  const expected = createHmac("sha512", policy.secretKey)
    .update(rawBody)
    .digest();
  return timingSafeEqual(expected, Buffer.from(policy.signature, "hex"));
};

export const fingerprintMonnifyWebhook = (rawBody: Buffer): string =>
  createHash("sha256").update(rawBody).digest("hex");

const webhookSchema = z.object({
  eventType: z.string().min(1),
  eventData: z.record(z.string(), z.unknown()),
});

export interface NormalizedMonnifyWebhook {
  readonly eventData: Readonly<Record<string, unknown>>;
  readonly eventType: string;
  readonly providerEventId?: string;
}

export const normalizeMonnifyWebhook = (
  value: unknown,
): NormalizedMonnifyWebhook => {
  const webhook = webhookSchema.parse(value);
  const candidateId =
    webhook.eventData.transactionReference ??
    webhook.eventData.reference ??
    webhook.eventData.mandateReference;
  return {
    eventType: webhook.eventType,
    eventData: webhook.eventData,
    ...(typeof candidateId === "string"
      ? { providerEventId: candidateId }
      : {}),
  };
};
