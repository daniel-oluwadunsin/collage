import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { TelegramStatusCard } from "@collage/contracts";
import type { Transformer } from "grammy";
import type { Update, UserFromGetMe } from "grammy/types";

import { createCollageBot } from "./bot.js";
import type { InternalTelegramApi, TelegramPerson } from "./internal-api.js";

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

class FakeInternalApi implements InternalTelegramApi {
  readonly joined: TelegramPerson[] = [];
  readonly left: TelegramPerson[] = [];
  readonly pins: string[] = [];
  botMembershipChanges = 0;
  statusCardCalls = 0;

  card: TelegramStatusCard = {
    state: "EMPTY",
    text: "No current Collage. An administrator can create one.",
    parseMode: "HTML",
    buttons: [
      {
        label: "Create Collage",
        startAppToken: "opaque_launch_token_123456789",
      },
    ],
    pin: true,
    replaceMessageId: null,
  };

  upsertChat(): Promise<void> {
    return Promise.resolve();
  }

  getStatusCard(): Promise<TelegramStatusCard> {
    this.statusCardCalls += 1;
    return Promise.resolve(this.card);
  }

  memberJoined(input: TelegramPerson): Promise<void> {
    this.joined.push(input);
    return Promise.resolve();
  }

  memberLeft(input: TelegramPerson) {
    this.left.push(input);
    return Promise.resolve({
      notification: {
        text: "<b>Registered member left</b>",
        parseMode: "HTML" as const,
        buttons: [],
      },
    });
  }

  botMembershipChanged(): Promise<void> {
    this.botMembershipChanges += 1;
    return Promise.resolve();
  }

  recordPinned(input: {
    readonly telegramChatId: string;
    readonly messageId: string;
  }): Promise<void> {
    this.pins.push(`${input.telegramChatId}:${input.messageId}`);
    return Promise.resolve();
  }

  ready(): Promise<boolean> {
    return Promise.resolve(true);
  }
}

interface TelegramCall {
  readonly method: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

const mockedTelegram = (calls: TelegramCall[]): Transformer =>
  ((_previous, method, payload) => {
    calls.push({
      method,
      payload: payload as Readonly<Record<string, unknown>>,
    });
    if (method === "getChatMember") {
      const userId = (payload as { readonly user_id: number }).user_id;
      return Promise.resolve({
        ok: true,
        result:
          userId === botInfo.id
            ? {
                status: "administrator",
                user: botInfo,
                can_be_edited: false,
                is_anonymous: false,
                can_manage_chat: true,
                can_delete_messages: false,
                can_manage_video_chats: false,
                can_restrict_members: false,
                can_promote_members: false,
                can_change_info: false,
                can_invite_users: false,
                can_post_stories: false,
                can_edit_stories: false,
                can_delete_stories: false,
                can_pin_messages: true,
                can_manage_topics: false,
              }
            : {
                status: "creator",
                user: {
                  id: userId,
                  is_bot: false,
                  first_name: "Ada",
                },
                is_anonymous: false,
              },
      });
    }
    if (method === "sendMessage") {
      return Promise.resolve({
        ok: true,
        result: {
          message_id: 77,
          date: 1_700_000_000,
          chat: { id: -1001, type: "supergroup", title: "Ajo & Friends" },
          text: (payload as { readonly text: string }).text,
        },
      });
    }
    return Promise.resolve({ ok: true, result: true });
  }) as Transformer;

const groupCommand = (text: string): Update => ({
  update_id: 10,
  message: {
    message_id: 1,
    date: 1_700_000_000,
    chat: { id: -1001, type: "supergroup", title: "Ajo & Friends" },
    from: { id: 42, is_bot: false, first_name: "Ada" },
    text,
    entities: [{ type: "bot_command", offset: 0, length: text.length }],
  },
});

void describe("Collage Telegram bot", () => {
  void it("renders an API-approved status with an opaque direct Mini App link and pins it", async () => {
    const calls: TelegramCall[] = [];
    const internalApi = new FakeInternalApi();
    const bot = createCollageBot({
      token: "123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefgh",
      botUsername: "CollageBot",
      miniAppShortName: "collage",
      internalApi,
      botInfo,
      apiTransformer: mockedTelegram(calls),
    });

    await bot.handleUpdate(groupCommand("/collage@CollageBot"));

    const send = calls.find(({ method }) => method === "sendMessage");
    assert.ok(send);
    const markup = send.payload.reply_markup as {
      readonly inline_keyboard: readonly (readonly {
        readonly url: string;
      }[])[];
    };
    assert.match(
      markup.inline_keyboard[0]?.[0]?.url ?? "",
      /^https:\/\/t\.me\/CollageBot\/collage\?startapp=opaque_launch_token_123456789&mode=compact$/u,
    );
    assert.ok(calls.some(({ method }) => method === "pinChatMessage"));
    assert.deepEqual(internalApi.pins, ["-1001:77"]);
  });

  void it("escapes hostile new-member names in safe Telegram mentions", async () => {
    const calls: TelegramCall[] = [];
    const internalApi = new FakeInternalApi();
    const bot = createCollageBot({
      token: "123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefgh",
      botUsername: "CollageBot",
      miniAppShortName: "collage",
      internalApi,
      botInfo,
      apiTransformer: mockedTelegram(calls),
    });
    await bot.handleUpdate({
      update_id: 11,
      message: {
        message_id: 2,
        date: 1_700_000_001,
        chat: { id: -1001, type: "supergroup", title: "Ajo & Friends" },
        from: { id: 42, is_bot: false, first_name: "Ada" },
        new_chat_members: [
          { id: 55, is_bot: false, first_name: "<script>&Ada" },
        ],
      },
    });

    const send = calls.find(({ method }) => method === "sendMessage");
    assert.match(String(send?.payload.text), /&lt;script&gt;&amp;Ada/u);
    assert.doesNotMatch(String(send?.payload.text), /<script>/u);
    assert.equal(internalApi.joined[0]?.telegramUserId, "55");
  });

  void it("synchronizes a registered-member leave and sends only the API-approved notice", async () => {
    const calls: TelegramCall[] = [];
    const internalApi = new FakeInternalApi();
    const bot = createCollageBot({
      token: "123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefgh",
      botUsername: "CollageBot",
      miniAppShortName: "collage",
      internalApi,
      botInfo,
      apiTransformer: mockedTelegram(calls),
    });
    await bot.handleUpdate({
      update_id: 12,
      message: {
        message_id: 3,
        date: 1_700_000_002,
        chat: { id: -1001, type: "supergroup", title: "Ajo & Friends" },
        from: { id: 42, is_bot: false, first_name: "Ada" },
        left_chat_member: { id: 55, is_bot: false, first_name: "Ada" },
      },
    });

    assert.equal(internalApi.left[0]?.telegramUserId, "55");
    const send = calls.find(({ method }) => method === "sendMessage");
    assert.equal(send?.payload.text, "<b>Registered member left</b>");
  });

  void it("handles bot addition and explains the missing pin permission", async () => {
    const calls: TelegramCall[] = [];
    const internalApi = new FakeInternalApi();
    const bot = createCollageBot({
      token: "123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefgh",
      botUsername: "CollageBot",
      miniAppShortName: "collage",
      internalApi,
      botInfo,
      apiTransformer: mockedTelegram(calls),
    });
    await bot.handleUpdate({
      update_id: 13,
      my_chat_member: {
        chat: { id: -1001, type: "supergroup", title: "Ajo & Friends" },
        from: { id: 42, is_bot: false, first_name: "Ada" },
        date: 1_700_000_003,
        old_chat_member: { status: "left", user: botInfo },
        new_chat_member: { status: "member", user: botInfo },
      },
    });

    assert.equal(internalApi.botMembershipChanges, 1);
    const send = calls.find(({ method }) => method === "sendMessage");
    assert.match(String(send?.payload.text), /Pin messages/u);
  });

  void it("responds to an explicit bot mention under privacy mode", async () => {
    const calls: TelegramCall[] = [];
    const internalApi = new FakeInternalApi();
    const bot = createCollageBot({
      token: "123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefgh",
      botUsername: "CollageBot",
      miniAppShortName: "collage",
      internalApi,
      botInfo,
      apiTransformer: mockedTelegram(calls),
    });
    await bot.handleUpdate({
      update_id: 14,
      message: {
        message_id: 4,
        date: 1_700_000_004,
        chat: { id: -1001, type: "supergroup", title: "Ajo & Friends" },
        from: { id: 42, is_bot: false, first_name: "Ada" },
        text: "Hello @CollageBot",
        entities: [{ type: "mention", offset: 6, length: 11 }],
      },
    });

    assert.equal(internalApi.statusCardCalls, 1);
  });
});
