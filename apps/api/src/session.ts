import { createHmac, timingSafeEqual } from "node:crypto";

import { z } from "zod";

import { unauthorized } from "./errors.js";

const payloadSchema = z.object({
  exp: z.number().int().positive(),
  telegramUserId: z.string().min(1),
  userId: z.uuid(),
});

export type ApiPrincipal = z.infer<typeof payloadSchema>;

const sign = (payload: string, secret: Buffer): Buffer =>
  createHmac("sha256", secret).update(payload).digest();

export class SessionService {
  constructor(
    private readonly secret: Buffer,
    private readonly lifetimeSeconds = 900,
  ) {
    if (secret.byteLength < 32) {
      throw new Error("Session secret must be at least 32 bytes");
    }
  }

  issue(principal: Omit<ApiPrincipal, "exp">, now = new Date()): string {
    const payload = Buffer.from(
      JSON.stringify({
        ...principal,
        exp: Math.floor(now.getTime() / 1000) + this.lifetimeSeconds,
      }),
    ).toString("base64url");
    return `${payload}.${sign(payload, this.secret).toString("base64url")}`;
  }

  verify(token: string, now = new Date()): ApiPrincipal {
    const [payload, signature, extra] = token.split(".");
    if (
      payload === undefined ||
      signature === undefined ||
      extra !== undefined
    ) {
      throw unauthorized();
    }
    const received = Buffer.from(signature, "base64url");
    const expected = sign(payload, this.secret);
    if (
      received.byteLength !== expected.byteLength ||
      !timingSafeEqual(received, expected)
    ) {
      throw unauthorized();
    }
    let decoded: unknown;
    try {
      decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    } catch {
      throw unauthorized();
    }
    const principal = payloadSchema.parse(decoded);
    if (principal.exp <= Math.floor(now.getTime() / 1000)) {
      throw unauthorized();
    }
    return principal;
  }
}
