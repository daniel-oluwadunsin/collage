import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";

import {
  buildTelegramMiniAppLink,
  escapeTelegramHtml,
  safeTelegramMention,
  verifyTelegramInitData,
} from "./index.js";

const signFixture = (
  fields: Readonly<Record<string, string>>,
  botToken: string,
): string => {
  const check = Object.entries(fields)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secret = createHmac("sha256", "WebAppData").update(botToken).digest();
  const hash = createHmac("sha256", secret).update(check).digest("hex");
  return new URLSearchParams({ ...fields, hash }).toString();
};

void test("verifies Telegram Mini App init data and rejects tampering/expiry", () => {
  const botToken = "123456:test-only-token";
  const now = new Date("2026-07-18T10:00:00.000Z");
  const fixture = signFixture(
    {
      auth_date: String(Math.floor(now.getTime() / 1000)),
      query_id: "AAEAAAE",
      user: JSON.stringify({ id: 123456, first_name: "Ada" }),
    },
    botToken,
  );
  assert.equal(
    verifyTelegramInitData(fixture, botToken, { now }).user.id,
    123456,
  );
  assert.throws(() =>
    verifyTelegramInitData(fixture.replace("Ada", "Eve"), botToken, { now }),
  );
  assert.throws(() =>
    verifyTelegramInitData(fixture, botToken, {
      now: new Date("2026-07-18T10:10:00.000Z"),
    }),
  );
});

void test("builds compact opaque Mini App links and safe HTML mentions", () => {
  assert.equal(
    buildTelegramMiniAppLink({
      botUsername: "@CollageBot",
      shortName: "collage",
      startAppToken: "opaque+/=",
    }),
    "https://t.me/CollageBot/collage?startapp=opaque%2B%2F%3D&mode=compact",
  );
  assert.equal(
    escapeTelegramHtml('<Ada & "Eve">'),
    "&lt;Ada &amp; &quot;Eve&quot;&gt;",
  );
  assert.equal(
    safeTelegramMention("12345", "<Ada>"),
    '<a href="tg://user?id=12345">&lt;Ada&gt;</a>',
  );
});
