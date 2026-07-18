import assert from "node:assert/strict";
import { signInternalRequest, MemoryReplayStore } from "@collage/security";
import { describe, it } from "node:test";
import { healthResponseSchema } from "@collage/contracts";
import request from "supertest";
import { z } from "zod";
import { createApiApp } from "./app.js";
import { ApiError } from "./errors.js";
import { createInternalAuthenticator } from "./internal-auth.js";
import { maskAccountNumber } from "./database-workflow.js";
import { SessionService } from "./session.js";
import {
  unavailableWorkflowService,
  type WorkflowService,
} from "./workflow.js";

void describe("api health", () => {
  void it("reports liveness without exposing internals", async () => {
    const response = await request(createApiApp()).get("/health/live");
    const body = healthResponseSchema.parse(response.body);

    assert.equal(response.status, 200);
    assert.equal(body.service, "api");
    assert.equal(body.status, "ok");
  });
});

const workflow = (overrides: Partial<WorkflowService>): WorkflowService => ({
  ...unavailableWorkflowService,
  ...overrides,
});

void describe("API security boundaries", () => {
  void it("rejects missing sessions and accepts a valid signed session", async () => {
    const sessions = new SessionService(Buffer.alloc(32, 7));
    const app = createApiApp({
      sessionService: sessions,
      workflow: workflow({
        getBanks: () =>
          Promise.resolve([{ code: "001", name: "Fixture Bank" }]),
      }),
    });
    assert.equal((await request(app).get("/v1/banks")).status, 401);

    const token = sessions.issue({
      userId: "81b9e36a-a491-4688-8697-cbe8cb747c30",
      telegramUserId: "1234",
    });
    const response = await request(app)
      .get("/v1/banks")
      .set("authorization", `Bearer ${token}`);
    assert.equal(response.status, 200);
    const body = z
      .object({ data: z.array(z.object({ name: z.string() })) })
      .parse(response.body);
    assert.equal(body.data[0]?.name, "Fixture Bank");
  });

  void it("returns typed conflicts without leaking internal detail", async () => {
    const sessions = new SessionService(Buffer.alloc(32, 8));
    const app = createApiApp({
      sessionService: sessions,
      workflow: workflow({
        openRegistration: () =>
          Promise.reject(
            new ApiError(409, "STALE_OR_LOCKED", "State changed."),
          ),
      }),
    });
    const token = sessions.issue({
      userId: "81b9e36a-a491-4688-8697-cbe8cb747c30",
      telegramUserId: "1234",
    });
    const response = await request(app)
      .post(
        "/v1/collages/81b9e36a-a491-4688-8697-cbe8cb747c31/open-registration",
      )
      .set("authorization", `Bearer ${token}`);
    assert.equal(response.status, 409);
    const body = z
      .object({ error: z.object({ code: z.string() }) })
      .parse(response.body);
    assert.equal(body.error.code, "STALE_OR_LOCKED");
    assert.equal(JSON.stringify(response.body).includes("stack"), false);
  });

  void it("enforces strict CORS and preserves exact webhook bytes", async () => {
    let received = "";
    const app = createApiApp({
      allowedOrigins: ["https://app.example.test"],
      webhookIngress: {
        ingest(rawBody) {
          received = rawBody.toString("utf8");
          return Promise.resolve({ duplicate: false });
        },
      },
    });
    assert.equal(
      (
        await request(app)
          .get("/health/live")
          .set("origin", "https://evil.example.test")
      ).status,
      403,
    );
    const raw = '{"eventType":"SUCCESSFUL_TRANSACTION","eventData":{"x":1}}';
    const response = await request(app)
      .post("/webhooks/monnify")
      .set("content-type", "application/json")
      .send(raw);
    assert.equal(response.status, 200);
    assert.equal(received, raw);
  });

  void it("authenticates internal bot requests and rejects replay", async () => {
    const secret = Buffer.alloc(32, 9);
    const body = JSON.stringify({
      telegramChatId: "-1001",
      title: "Fixture",
      type: "SUPERGROUP",
    });
    const headers = signInternalRequest(
      {
        method: "POST",
        path: "/internal/telegram/chats/upsert",
        body,
      },
      "bot",
      secret,
    );
    const app = createApiApp({
      internalAuthenticate: createInternalAuthenticator(
        secret,
        new MemoryReplayStore(),
      ),
      workflow: workflow({
        internalTelegram: () => Promise.resolve({ synchronized: true }),
      }),
    });
    const first = await request(app)
      .post("/internal/telegram/chats/upsert")
      .set("x-collage-internal-service", headers["x-collage-internal-service"])
      .set(
        "x-collage-internal-timestamp",
        headers["x-collage-internal-timestamp"],
      )
      .set("x-collage-internal-nonce", headers["x-collage-internal-nonce"])
      .set(
        "x-collage-internal-signature",
        headers["x-collage-internal-signature"],
      )
      .set("content-type", "application/json")
      .send(body);
    const replay = await request(app)
      .post("/internal/telegram/chats/upsert")
      .set("x-collage-internal-service", headers["x-collage-internal-service"])
      .set(
        "x-collage-internal-timestamp",
        headers["x-collage-internal-timestamp"],
      )
      .set("x-collage-internal-nonce", headers["x-collage-internal-nonce"])
      .set(
        "x-collage-internal-signature",
        headers["x-collage-internal-signature"],
      )
      .set("content-type", "application/json")
      .send(body);
    assert.equal(first.status, 200);
    assert.equal(replay.status, 401);
  });

  void it("masks payout account numbers", () => {
    assert.equal(maskAccountNumber("0123456789"), "******6789");
    assert.equal(maskAccountNumber("1234"), "1234");
  });
});
