import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";

import { createRedisConnection } from "@collage/queue";

import { RedisNotificationDeduplicator } from "./notifications.js";

const redisUrl = process.env.TEST_REDIS_URL;
const integrationTest = redisUrl === undefined ? test.skip : test;

void integrationTest(
  "notification delivery claims are atomic, releasable, and retained after completion",
  async () => {
    if (redisUrl === undefined) throw new Error("TEST_REDIS_URL is required");
    const redis = createRedisConnection(redisUrl);
    await redis.connect();
    try {
      const deduplicator = new RedisNotificationDeduplicator(redis, 60_000, 60);
      const deliveryId = randomUUID();
      const first = await deduplicator.claim(deliveryId);
      assert.notEqual(first, null);
      assert.equal(await deduplicator.claim(deliveryId), null);
      if (first === null) throw new Error("Expected initial delivery claim");
      await deduplicator.release(deliveryId, first);
      const second = await deduplicator.claim(deliveryId);
      assert.notEqual(second, null);
      if (second === null) throw new Error("Expected released delivery claim");
      await deduplicator.complete(deliveryId, second);
      assert.equal(await deduplicator.claim(deliveryId), null);
    } finally {
      await redis.quit();
    }
  },
);
