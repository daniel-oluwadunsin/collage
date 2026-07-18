import assert from "node:assert/strict";
import { test } from "node:test";

import {
  decryptString,
  encryptString,
  keyedHash,
  LaunchTokenService,
  MemoryReplayStore,
  signInternalRequest,
  verifyInternalRequest,
  type LaunchTokenStore,
  type StoredLaunchToken,
} from "./index.js";

const key = Buffer.alloc(32, 7);

void test("AES-256-GCM binds ciphertext to its context and detects tampering", () => {
  const keyring = { activeKeyId: "local-v1", keys: { "local-v1": key } };
  const encrypted = encryptString("08012345678", keyring, "member:phone");
  assert.equal(
    decryptString(encrypted, keyring, "member:phone"),
    "08012345678",
  );
  assert.throws(() => decryptString(encrypted, keyring, "member:nin"));
  assert.notEqual(
    encrypted,
    encryptString("08012345678", keyring, "member:phone"),
  );
});

void test("keyed hashes normalize equivalent external identifiers", () => {
  assert.equal(keyedHash("  Ada\u212A ", key), keyedHash("AdaK", key));
});

void test("internal service authentication rejects replay and stale requests", async () => {
  const request = { method: "POST", path: "/internal/jobs", body: "{}" };
  const now = new Date("2026-07-18T10:00:00.000Z");
  const headers = signInternalRequest(request, "worker", key, now);
  const replayStore = new MemoryReplayStore();
  const secrets = (service: string): Buffer | undefined =>
    service === "worker" ? key : undefined;
  assert.equal(
    await verifyInternalRequest(request, headers, secrets, replayStore, {
      now,
    }),
    true,
  );
  assert.equal(
    await verifyInternalRequest(request, headers, secrets, replayStore, {
      now,
    }),
    false,
  );
  assert.equal(
    await verifyInternalRequest(
      request,
      signInternalRequest(request, "worker", key, now),
      secrets,
      new MemoryReplayStore(),
      { now: new Date("2026-07-18T10:02:00.000Z") },
    ),
    false,
  );
});

void test("opaque launch tokens are stored only as keyed hashes and consumed once", async () => {
  let stored: StoredLaunchToken | undefined;
  const store: LaunchTokenStore = {
    save(token) {
      stored = token;
      return Promise.resolve();
    },
    consume(tokenHash, now) {
      const current = stored;
      if (current?.tokenHash !== tokenHash || current.expiresAt <= now) {
        return Promise.resolve(null);
      }
      stored = undefined;
      return Promise.resolve({ id: "token-id", ...current });
    },
  };
  const service = new LaunchTokenService(store, key);
  const now = new Date("2026-07-18T10:00:00.000Z");
  const token = await service.issue(
    { action: "register", userId: "user-id" },
    new Date("2026-07-18T10:05:00.000Z"),
    true,
    now,
  );
  assert.notEqual(stored?.tokenHash, token);
  assert.equal((await service.consume(token, now))?.userId, "user-id");
  assert.equal(await service.consume(token, now), null);
});
