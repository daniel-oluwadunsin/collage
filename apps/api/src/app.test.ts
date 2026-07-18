import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { healthResponseSchema } from "@collage/contracts";
import request from "supertest";
import { createApiApp } from "./app.js";

void describe("api health", () => {
  void it("reports liveness without exposing internals", async () => {
    const response = await request(createApiApp()).get("/health/live");
    const body = healthResponseSchema.parse(response.body);

    assert.equal(response.status, 200);
    assert.equal(body.service, "api");
    assert.equal(body.status, "ok");
  });
});
