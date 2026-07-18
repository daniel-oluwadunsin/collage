import type { TelegramStatusCard } from "@collage/contracts";
import {
  buildTelegramMiniAppLink,
  escapeTelegramHtml,
  safeTelegramMention,
} from "@collage/telegram";
import {
  Bot,
  GrammyError,
  InlineKeyboard,
  type Api,
  type Context,
  type Transformer,
} from "grammy";
import type {
  Chat,
  ChatMember,
  ChatMemberUpdated,
  User,
  UserFromGetMe,
} from "grammy/types";

import type { InternalTelegramApi, TelegramPerson } from "./internal-api.js";
import { createTelegramRateLimitTransformer } from "./rate-limit.js";

export const TELEGRAM_ALLOWED_UPDATES = [
  "message",
  "my_chat_member",
  "chat_member",
] as const;

const pinGuidance =
  "<b>Pin permission needed</b>\nMake Collage an administrator and enable <i>Pin messages</i> so the group status card can stay current.";

const isGroupChat = (
  chat: Chat,
): chat is Extract<Chat, { type: "group" | "supergroup" }> =>
  chat.type === "group" || chat.type === "supergroup";

const roleOf = (member: ChatMember): TelegramPerson["role"] => {
  switch (member.status) {
    case "creator":
      return "CREATOR";
    case "administrator":
      return "ADMINISTRATOR";
    case "member":
      return "MEMBER";
    case "restricted":
      return "RESTRICTED";
    case "left":
      return "LEFT";
    case "kicked":
      return "KICKED";
  }
};

const canPin = (member: ChatMember): boolean =>
  member.status === "creator" ||
  (member.status === "administrator" && member.can_pin_messages === true);

const isCurrentAdmin = (member: ChatMember): boolean =>
  member.status === "creator" || member.status === "administrator";

const person = (
  chatId: number,
  user: User,
  role: TelegramPerson["role"],
): TelegramPerson => ({
  telegramChatId: String(chatId),
  telegramUserId: String(user.id),
  firstName: user.first_name,
  role,
});

const keyboardFor = (
  card: TelegramStatusCard,
  botUsername: string,
  shortName: string,
): InlineKeyboard | undefined => {
  if (card.buttons.length === 0) return undefined;
  const keyboard = new InlineKeyboard();
  for (const button of card.buttons) {
    keyboard.url(
      button.label,
      "startAppToken" in button
        ? buildTelegramMiniAppLink({
            botUsername,
            shortName,
            startAppToken: button.startAppToken,
            mode: "compact",
          })
        : button.url,
    );
    keyboard.row();
  }
  return keyboard;
};

const mentionDetected = (ctx: Context, username: string): boolean => {
  const message = ctx.message;
  if (message?.text === undefined) return false;
  const text = message.text;
  const normalized = `@${username.replace(/^@/u, "").toLowerCase()}`;
  return (message.entities ?? []).some((entity) => {
    if (entity.type !== "mention" && entity.type !== "bot_command") {
      return false;
    }
    const value = text
      .slice(entity.offset, entity.offset + entity.length)
      .toLowerCase();
    return value === normalized || value.endsWith(normalized);
  });
};

export interface CollageBotOptions {
  readonly token: string;
  readonly botUsername: string;
  readonly miniAppShortName: string;
  readonly internalApi: InternalTelegramApi;
  readonly maxRateLimitRetries?: number;
  readonly onError?: (error: unknown) => void;
  readonly apiTransformer?: Transformer;
  readonly botInfo?: UserFromGetMe;
}

export const createCollageBot = (options: CollageBotOptions): Bot => {
  const bot = new Bot(
    options.token,
    options.botInfo === undefined
      ? { client: { canUseWebhookReply: () => false } }
      : {
          client: { canUseWebhookReply: () => false },
          botInfo: options.botInfo,
        },
  );
  bot.api.config.use(
    createTelegramRateLimitTransformer({
      maxRetries: options.maxRateLimitRetries ?? 2,
    }),
  );
  if (options.apiTransformer !== undefined) {
    bot.api.config.use(options.apiTransformer);
  }
  const username = options.botUsername.replace(/^@/u, "");

  const sendHtml = async (
    api: Api,
    chatId: number | string,
    text: string,
    keyboard?: InlineKeyboard,
  ) =>
    api.sendMessage(chatId, text, {
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
      ...(keyboard === undefined ? {} : { reply_markup: keyboard }),
    });

  const ensureChat = async (ctx: Context): Promise<boolean> => {
    if (ctx.chat === undefined || !isGroupChat(ctx.chat)) return false;
    let botMember: ChatMember;
    try {
      botMember = await ctx.api.getChatMember(ctx.chat.id, ctx.me.id);
    } catch {
      return false;
    }
    await options.internalApi.upsertChat({
      telegramChatId: String(ctx.chat.id),
      title: ctx.chat.title,
      type: ctx.chat.type === "group" ? "GROUP" : "SUPERGROUP",
      ...(ctx.chat.username === undefined
        ? {}
        : { username: ctx.chat.username }),
      botCanPinMessages: canPin(botMember),
    });
    return canPin(botMember);
  };

  const syncActor = async (
    ctx: Context,
  ): Promise<{ readonly admin: boolean } | null> => {
    if (
      ctx.chat === undefined ||
      !isGroupChat(ctx.chat) ||
      ctx.from === undefined
    ) {
      return null;
    }
    let member: ChatMember;
    try {
      member = await ctx.api.getChatMember(ctx.chat.id, ctx.from.id);
    } catch {
      return null;
    }
    await options.internalApi.memberJoined(
      person(ctx.chat.id, ctx.from, roleOf(member)),
    );
    return { admin: isCurrentAdmin(member) };
  };

  const renderStatus = async (
    ctx: Context,
    variant: "status" | "rules" = "status",
  ): Promise<void> => {
    if (ctx.chat === undefined || !isGroupChat(ctx.chat)) {
      await sendHtml(
        ctx.api,
        ctx.chat?.id ?? ctx.from?.id ?? "",
        "Collage commands are designed for Telegram groups.",
      );
      return;
    }
    const pinAllowed = await ensureChat(ctx);
    const actor = await syncActor(ctx);
    const card = await options.internalApi.getStatusCard(
      String(ctx.chat.id),
      variant,
    );
    const adminFiltered =
      card.state === "EMPTY" && actor?.admin !== true
        ? {
            ...card,
            text: `${card.text}\n\nAsk a current group administrator to create it.`,
            buttons: [],
          }
        : card;
    const keyboard = keyboardFor(
      adminFiltered,
      username,
      options.miniAppShortName,
    );

    if (
      adminFiltered.pin &&
      pinAllowed &&
      adminFiltered.replaceMessageId !== null
    ) {
      try {
        await ctx.api.editMessageText(
          ctx.chat.id,
          Number(adminFiltered.replaceMessageId),
          adminFiltered.text,
          {
            parse_mode: "HTML",
            link_preview_options: { is_disabled: true },
            ...(keyboard === undefined ? {} : { reply_markup: keyboard }),
          },
        );
        return;
      } catch (error) {
        if (
          error instanceof GrammyError &&
          error.description.toLowerCase().includes("message is not modified")
        ) {
          return;
        }
        if (!(error instanceof GrammyError) || error.error_code !== 400) {
          throw error;
        }
        // A deterministic 400 means Telegram cannot edit the stored card, so
        // a replacement can be sent without masking an unknown network result.
      }
    }

    const sent = await sendHtml(
      ctx.api,
      ctx.chat.id,
      adminFiltered.text,
      keyboard,
    );
    if (adminFiltered.pin && pinAllowed) {
      await ctx.api.pinChatMessage(ctx.chat.id, sent.message_id, {
        disable_notification: true,
      });
      await options.internalApi.recordPinned({
        telegramChatId: String(ctx.chat.id),
        messageId: String(sent.message_id),
      });
    } else if (adminFiltered.pin && !pinAllowed) {
      await sendHtml(ctx.api, ctx.chat.id, pinGuidance);
    }
  };

  const handleBotMembership = async (
    update: ChatMemberUpdated,
    api: Api,
  ): Promise<void> => {
    if (!isGroupChat(update.chat)) return;
    const allowed = canPin(update.new_chat_member);
    await options.internalApi.upsertChat({
      telegramChatId: String(update.chat.id),
      title: update.chat.title,
      type: update.chat.type === "group" ? "GROUP" : "SUPERGROUP",
      ...(update.chat.username === undefined
        ? {}
        : { username: update.chat.username }),
      botCanPinMessages: allowed,
    });
    await options.internalApi.botMembershipChanged({
      telegramChatId: String(update.chat.id),
      botCanPinMessages: allowed,
    });
    const newlyAdded =
      ["left", "kicked"].includes(update.old_chat_member.status) &&
      ["member", "administrator"].includes(update.new_chat_member.status);
    if (newlyAdded) {
      await sendHtml(
        api,
        update.chat.id,
        allowed
          ? "<b>Collage is connected.</b>\nUse /collage to create or open this group's Collage."
          : `<b>Collage is connected.</b>\n${pinGuidance}`,
      );
    }
  };

  bot.command("collage", (ctx) => renderStatus(ctx));
  bot.command("status", (ctx) => renderStatus(ctx));
  bot.command("rules", (ctx) => renderStatus(ctx, "rules"));
  bot.command("help", async (ctx) => {
    await sendHtml(
      ctx.api,
      ctx.chat.id,
      "<b>Collage commands</b>\n/collage — create or open the group Collage\n/status — refresh the current status\n/rules — review the current rules\n/help — show this guide",
    );
  });

  bot.on("my_chat_member", async (ctx) => {
    await handleBotMembership(ctx.myChatMember, ctx.api);
  });

  bot.on("chat_member", async (ctx) => {
    const update = ctx.chatMember;
    if (!isGroupChat(update.chat) || update.new_chat_member.user.is_bot) return;
    const joined = [
      "member",
      "administrator",
      "creator",
      "restricted",
    ].includes(update.new_chat_member.status);
    const value = person(
      update.chat.id,
      update.new_chat_member.user,
      roleOf(update.new_chat_member),
    );
    if (joined) {
      await options.internalApi.memberJoined(value);
    } else {
      const result = await options.internalApi.memberLeft(value);
      if (result.notification !== null) {
        await sendHtml(ctx.api, update.chat.id, result.notification.text);
      }
    }
  });

  bot.on("message:new_chat_members", async (ctx) => {
    if (!isGroupChat(ctx.chat)) return;
    for (const user of ctx.message.new_chat_members) {
      if (user.id === ctx.me.id) continue;
      await options.internalApi.memberJoined(
        person(ctx.chat.id, user, "MEMBER"),
      );
      await sendHtml(
        ctx.api,
        ctx.chat.id,
        `Welcome ${safeTelegramMention(String(user.id), user.first_name)}. Use /collage to view this group's Collage.`,
      );
    }
  });

  bot.on("message:left_chat_member", async (ctx) => {
    if (!isGroupChat(ctx.chat) || ctx.message.left_chat_member.id === ctx.me.id)
      return;
    const result = await options.internalApi.memberLeft(
      person(ctx.chat.id, ctx.message.left_chat_member, "LEFT"),
    );
    if (result.notification !== null) {
      await sendHtml(ctx.api, ctx.chat.id, result.notification.text);
    }
  });

  bot.on("message:text", async (ctx) => {
    if (mentionDetected(ctx, username)) {
      await renderStatus(ctx);
    }
  });

  bot.catch(({ error }) => {
    options.onError?.(error);
    throw error;
  });

  return bot;
};

export const telegramHtml = {
  escape: escapeTelegramHtml,
  pinGuidance,
};
