import assert from "node:assert/strict";
import { it } from "node:test";

import { SignedInternalTelegramClient } from "./internal-api.js";

void it("signs the exact internal status-card path including its query", async () => {
  const observed: { url?: string; service?: string } = {};
  const mockFetch: typeof fetch = (input, init) => {
    observed.url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    const service = new Headers(init?.headers).get(
      "x-collage-internal-service",
    );
    if (service !== null) observed.service = service;
    return Promise.resolve(
      new Response(
        JSON.stringify({
          success: true,
          requestId: "request-123",
          data: {
            state: "ACTIVE",
            text: "<b>Fixture</b>",
            parseMode: "HTML",
            buttons: [],
            pin: true,
            replaceMessageId: null,
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
  };
  const client = new SignedInternalTelegramClient(
    "https://api.example.test",
    "01234567890123456789012345678901",
    1_000,
    mockFetch,
  );

  const card = await client.getStatusCard("-100123", "rules");

  assert.equal(card.state, "ACTIVE");
  assert.equal(
    observed.url,
    "https://api.example.test/internal/telegram/chats/-100123/status-card?variant=rules",
  );
  assert.equal(observed.service, "bot");
});
