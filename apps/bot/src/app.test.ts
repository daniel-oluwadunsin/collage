import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { healthResponseSchema } from "@collage/contracts";
import request from "supertest";
import { createBotApp } from "./app.js";

void describe("bot health", () => {
  void it("reports process readiness", async () => {
    const response = await request(createBotApp()).get("/health/ready");
    const body = healthResponseSchema.parse(response.body);

    assert.equal(response.status, 200);
    assert.equal(body.service, "bot");
    assert.equal(body.status, "ready");
  });
});
