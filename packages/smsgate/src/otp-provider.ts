import type { SmsGateClient } from "./client.js";
import { SmsGateError, type SmsGateMessageResult } from "./types.js";

export interface SmsGateOtpProviderOptions {
  readonly deviceId?: string;
  readonly priority?: number;
  readonly simNumber?: number;
  readonly withDeliveryReport?: boolean;
}

export interface SmsGateOtpInput {
  readonly code: string;
  readonly expiresInSeconds: number;
  readonly idempotencyKey: string;
  readonly phone: string;
  readonly purpose: "registration-phone";
}

export interface SmsGateOtpDelivery {
  readonly outcome: "queued" | "unknown";
}

export class SmsGateOtpProvider {
  constructor(
    private readonly client: SmsGateClient,
    private readonly options: SmsGateOtpProviderOptions = {},
  ) {}

  async send(input: SmsGateOtpInput): Promise<SmsGateOtpDelivery> {
    let result: SmsGateMessageResult;
    try {
      result = await this.client.sendMessage({
        id: input.idempotencyKey,
        phoneNumber: input.phone,
        text: `Your Collage verification code is ${input.code}. It expires in ${String(
          Math.ceil(input.expiresInSeconds / 60),
        )} minutes. Do not share this code.`,
        ttlSeconds: input.expiresInSeconds,
        ...(this.options.deviceId === undefined
          ? {}
          : { deviceId: this.options.deviceId }),
        ...(this.options.priority === undefined
          ? {}
          : { priority: this.options.priority }),
        ...(this.options.simNumber === undefined
          ? {}
          : { simNumber: this.options.simNumber }),
        ...(this.options.withDeliveryReport === undefined
          ? {}
          : { withDeliveryReport: this.options.withDeliveryReport }),
      });
    } catch (error) {
      if (error instanceof SmsGateError && error.failure.outcomeUnknown) {
        return { outcome: "unknown" };
      }
      throw error;
    }
    if (result.state === "Failed") {
      throw new Error("SMSGate rejected the OTP message.");
    }
    return { outcome: "queued" };
  }
}
