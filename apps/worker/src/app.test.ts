import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { healthResponseSchema } from "@collage/contracts";
import request from "supertest";
import { createWorkerApp } from "./app.js";

void describe("worker health", () => {
  void it("reports liveness", async () => {
    const response = await request(createWorkerApp()).get("/health/live");
    const body = healthResponseSchema.parse(response.body);

    assert.equal(response.status, 200);
    assert.equal(body.service, "worker");
    assert.equal(body.status, "ok");
  });
});
