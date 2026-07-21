import { randomBytes } from "node:crypto";

import { keyedHash } from "./crypto.js";

export interface LaunchTokenBinding {
  readonly action: string;
  readonly chatId?: string;
  readonly collageId?: string;
  readonly resourceId?: string;
  readonly userId?: string;
}

export interface StoredLaunchToken extends LaunchTokenBinding {
  readonly expiresAt: Date;
  readonly singleUse: boolean;
  readonly tokenHash: string;
}

export interface ConsumedLaunchToken extends LaunchTokenBinding {
  readonly id: string;
}

export interface LaunchTokenStore {
  consume(tokenHash: string, now: Date): Promise<ConsumedLaunchToken | null>;
  save(token: StoredLaunchToken): Promise<void>;
}

export class LaunchTokenService {
  constructor(
    private readonly store: LaunchTokenStore,
    private readonly hashKey: Buffer,
  ) {}

  async issue(
    binding: LaunchTokenBinding,
    expiresAt: Date,
    singleUse = true,
    now = new Date(),
  ): Promise<string> {
    if (
      binding.userId === undefined &&
      binding.collageId === undefined &&
      binding.resourceId === undefined &&
      binding.chatId === undefined
    ) {
      throw new Error("Launch tokens require at least one binding");
    }
    if (expiresAt <= now) {
      throw new Error("Launch token expiry must be in the future");
    }
    const token = randomBytes(32).toString("base64url");
    await this.store.save({
      ...binding,
      tokenHash: keyedHash(token, this.hashKey),
      expiresAt,
      singleUse,
    });
    return token;
  }

  consume(
    token: string,
    now = new Date(),
  ): Promise<ConsumedLaunchToken | null> {
    return this.store.consume(keyedHash(token, this.hashKey), now);
  }
}
