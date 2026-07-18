import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { healthResponseSchema } from "@collage/contracts";
import { Bot } from "grammy";
import type { UserFromGetMe } from "grammy/types";
import request from "supertest";

import { createBotApp } from "./app.js";

const token = "123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefgh";
const botInfo: UserFromGetMe = {
  id: 999,
  is_bot: true,
  first_name: "Collage",
  username: "CollageBot",
  can_join_groups: true,
  can_read_all_group_messages: false,
  supports_inline_queries: false,
  can_connect_to_business: false,
  has_main_web_app: true,
  has_topics_enabled: false,
  allows_users_to_create_topics: false,
  can_manage_bots: false,
  supports_join_request_queries: false,
};

void describe("bot HTTP service", () => {
  void it("reports liveness and dependency-aware readiness", async () => {
    const bot = new Bot(token);
    const app = createBotApp({
      bot,
      webhookSecret: "abcdefghijklmnopqrstuvwxyz_ABCDEFG",
      readiness: () => Promise.resolve(true),
    });
    const response = await request(app).get("/health/ready");
    const body = healthResponseSchema.parse(response.body);

    assert.equal(response.status, 200);
    assert.equal(body.service, "bot");
    assert.equal(body.status, "ready");
  });

  void it("rejects a webhook without Telegram's configured secret token", async () => {
    const bot = new Bot(token);
    const app = createBotApp({
      bot,
      webhookSecret: "abcdefghijklmnopqrstuvwxyz_ABCDEFG",
      readiness: () => Promise.resolve(true),
    });
    const response = await request(app)
      .post("/telegram/webhook")
      .send({ update_id: 1 });

    assert.equal(response.status, 401);
  });

  void it("accepts a valid secret-token webhook through grammY", async () => {
    const bot = new Bot(token, { botInfo });
    const secret = "abcdefghijklmnopqrstuvwxyz_ABCDEFG";
    const app = createBotApp({
      bot,
      webhookSecret: secret,
      readiness: () => Promise.resolve(true),
    });
    const response = await request(app)
      .post("/telegram/webhook")
      .set("x-telegram-bot-api-secret-token", secret)
      .send({ update_id: 2 });

    assert.equal(response.status, 200);
  });
});
