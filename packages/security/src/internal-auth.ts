import { createHash, createHmac, randomBytes } from "node:crypto";

import { constantTimeEqual } from "./crypto.js";

export interface InternalAuthHeaders {
  readonly "x-collage-internal-nonce": string;
  readonly "x-collage-internal-service": string;
  readonly "x-collage-internal-signature": string;
  readonly "x-collage-internal-timestamp": string;
}

export interface ReplayStore {
  claim(key: string, expiresAt: Date): Promise<boolean>;
}

export interface InternalRequest {
  readonly body: Buffer | string;
  readonly method: string;
  readonly path: string;
}

const bodyHash = (body: Buffer | string): string =>
  createHash("sha256").update(body).digest("hex");

const canonicalRequest = (
  request: InternalRequest,
  service: string,
  timestamp: string,
  nonce: string,
): string =>
  [
    request.method.toUpperCase(),
    request.path,
    bodyHash(request.body),
    service,
    timestamp,
    nonce,
  ].join("\n");

export const signInternalRequest = (
  request: InternalRequest,
  service: string,
  secret: Buffer,
  now = new Date(),
): InternalAuthHeaders => {
  if (secret.byteLength < 32) {
    throw new Error("Internal authentication secret must be at least 32 bytes");
  }
  const timestamp = Math.floor(now.getTime() / 1000).toString();
  const nonce = randomBytes(18).toString("base64url");
  const signature = createHmac("sha256", secret)
    .update(canonicalRequest(request, service, timestamp, nonce))
    .digest("base64url");
  return {
    "x-collage-internal-service": service,
    "x-collage-internal-timestamp": timestamp,
    "x-collage-internal-nonce": nonce,
    "x-collage-internal-signature": signature,
  };
};

export const verifyInternalRequest = async (
  request: InternalRequest,
  headers: InternalAuthHeaders,
  secretForService: (service: string) => Buffer | undefined,
  replayStore: ReplayStore,
  options: {
    readonly maxClockSkewSeconds?: number;
    readonly now?: Date;
  } = {},
): Promise<boolean> => {
  const now = options.now ?? new Date();
  const maxClockSkewSeconds = options.maxClockSkewSeconds ?? 60;
  const timestampSeconds = Number(headers["x-collage-internal-timestamp"]);
  if (
    !Number.isSafeInteger(timestampSeconds) ||
    Math.abs(now.getTime() / 1000 - timestampSeconds) > maxClockSkewSeconds
  ) {
    return false;
  }
  const service = headers["x-collage-internal-service"];
  const secret = secretForService(service);
  if (secret === undefined || secret.byteLength < 32) {
    return false;
  }
  const expected = createHmac("sha256", secret)
    .update(
      canonicalRequest(
        request,
        service,
        headers["x-collage-internal-timestamp"],
        headers["x-collage-internal-nonce"],
      ),
    )
    .digest("base64url");
  if (!constantTimeEqual(expected, headers["x-collage-internal-signature"])) {
    return false;
  }
  const replayKey = `${service}:${headers["x-collage-internal-nonce"]}`;
  const expiresAt = new Date((timestampSeconds + maxClockSkewSeconds) * 1000);
  return replayStore.claim(replayKey, expiresAt);
};

export class MemoryReplayStore implements ReplayStore {
  readonly #claims = new Map<string, number>();

  claim(key: string, expiresAt: Date): Promise<boolean> {
    const now = Date.now();
    for (const [claim, expiry] of this.#claims) {
      if (expiry <= now) {
        this.#claims.delete(claim);
      }
    }
    if (this.#claims.has(key)) {
      return Promise.resolve(false);
    }
    this.#claims.set(key, expiresAt.getTime());
    return Promise.resolve(true);
  }
}
