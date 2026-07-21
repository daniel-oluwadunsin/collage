import type {
  AssistantQueryRequest,
  AssistantQueryResponse,
  TelegramStatusCard,
} from "@collage/contracts";
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
  "<b>Pin permission needed</b>\nOpen Collage's administrator permissions and enable <i>Pin messages</i> so the group status card can stay current.";

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
  ...(user.last_name === undefined ? {} : { lastName: user.last_name }),
  ...(user.username === undefined ? {} : { username: user.username }),
  role,
});

export const keyboardFor = (
  card: TelegramStatusCard,
  botUsername: string,
): InlineKeyboard | undefined => {
  if (card.buttons.length === 0) return undefined;
  const keyboard = new InlineKeyboard();
  for (const button of card.buttons) {
    keyboard.url(
      button.label,
      "startAppToken" in button
        ? buildTelegramMiniAppLink({
            botUsername,
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

const looksLikeAssistantQuestion = (text: string): boolean =>
  text.includes("?") ||
  /^\s*(?:who|what|when|where|why|how|have|has|did|do|can|am|is|are|will|let me|show me|give me|update|change|view|join|register|pay)\b/iu.test(
    text,
  );

export interface CollageBotOptions {
  readonly token: string;
  readonly botUsername: string;
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
    replyToMessageId?: number,
    messageThreadId?: number,
  ) =>
    api.sendMessage(chatId, text, {
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
      ...(keyboard === undefined ? {} : { reply_markup: keyboard }),
      ...(replyToMessageId === undefined
        ? {}
        : {
            reply_parameters: {
              message_id: replyToMessageId,
              allow_sending_without_reply: true,
            },
          }),
      ...(messageThreadId === undefined
        ? {}
        : { message_thread_id: messageThreadId }),
    });

  const assistantKeyboard = (
    rows: NonNullable<AssistantQueryResponse["buttons"]>,
  ): InlineKeyboard => {
    const keyboard = new InlineKeyboard();
    for (const [rowIndex, row] of rows.entries()) {
      if (rowIndex > 0) keyboard.row();
      for (const button of row) keyboard.url(button.label, button.url);
    }
    return keyboard;
  };

  const assistantInput = (
    ctx: Context,
    rawText: string,
  ): AssistantQueryRequest | null => {
    if (
      ctx.chat === undefined ||
      !isGroupChat(ctx.chat) ||
      ctx.message === undefined
    )
      return null;
    const message = ctx.message;
    const botMention = new RegExp(
      `@${username.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
      "giu",
    );
    const text = rawText
      .replace(/^\/ask(?:@\w+)?\s*/iu, "")
      .replace(botMention, " ")
      .trim();
    if (text.length === 0) return null;
    const mentions: AssistantQueryRequest["mentions"] = [];
    let mentionIndex = 0;
    for (const entity of message.entities ?? []) {
      if (entity.type !== "mention" && entity.type !== "text_mention") continue;
      if (mentionIndex >= 10) break;
      const value = rawText.slice(entity.offset, entity.offset + entity.length);
      if (value.replace(/^@/u, "").toLowerCase() === username.toLowerCase())
        continue;
      mentionIndex += 1;
      mentions.push({
        reference: `MENTION_${String(mentionIndex)}`,
        ...(entity.type === "text_mention"
          ? {
              telegramUserId: String(entity.user.id),
              displayName: [entity.user.first_name, entity.user.last_name]
                .filter(Boolean)
                .join(" "),
            }
          : { username: value.replace(/^@/u, "") }),
      });
    }
    const replyUser = message.reply_to_message?.from;
    const sentAnonymously =
      message.sender_chat !== undefined || ctx.from === undefined;
    return {
      telegramChatId: String(ctx.chat.id),
      ...(sentAnonymously
        ? {}
        : {
            actorTelegramUserId: String(ctx.from.id),
            ...(ctx.from.username === undefined
              ? {}
              : { actorTelegramUsername: ctx.from.username }),
            actorDisplayName: [ctx.from.first_name, ctx.from.last_name]
              .filter(Boolean)
              .join(" "),
          }),
      telegramMessageId: message.message_id,
      ...(message.message_thread_id === undefined
        ? {}
        : { telegramMessageThreadId: message.message_thread_id }),
      text,
      ...(replyUser === undefined || replyUser.is_bot
        ? {}
        : {
            replyTarget: {
              telegramUserId: String(replyUser.id),
              ...(replyUser.username === undefined
                ? {}
                : { username: replyUser.username }),
              displayName: [replyUser.first_name, replyUser.last_name]
                .filter(Boolean)
                .join(" "),
            },
          }),
      mentions,
      sentAnonymously,
    };
  };

  const handleAssistant = async (
    ctx: Context,
    rawText: string,
  ): Promise<boolean> => {
    const input = assistantInput(ctx, rawText);
    if (input === null) return false;
    try {
      await ensureChat(ctx);
      if (!input.sentAnonymously) await syncActor(ctx);
      const answer = await options.internalApi.assistantQuery(input);
      await sendHtml(
        ctx.api,
        input.telegramChatId,
        answer.text,
        answer.buttons === undefined
          ? undefined
          : assistantKeyboard(answer.buttons),
        answer.replyToMessageId,
        answer.messageThreadId,
      );
    } catch {
      await sendHtml(
        ctx.api,
        input.telegramChatId,
        "The Collage assistant is temporarily unavailable. You can still use /status or /rules.",
        undefined,
        input.telegramMessageId,
        input.telegramMessageThreadId,
      );
    }
    return true;
  };

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
    const keyboard = keyboardFor(adminFiltered, username);

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
        await sendHtml(
          ctx.api,
          ctx.chat.id,
          adminFiltered.text,
          keyboard,
          ctx.message?.message_id,
        );
        return;
      } catch (error) {
        if (
          error instanceof GrammyError &&
          error.description.toLowerCase().includes("message is not modified")
        ) {
          await sendHtml(
            ctx.api,
            ctx.chat.id,
            adminFiltered.text,
            keyboard,
            ctx.message?.message_id,
          );
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
      ctx.message?.message_id,
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
          : update.new_chat_member.status === "administrator"
            ? `<b>Collage is now an administrator.</b>\nPin messages is still disabled. Enable <i>Pin messages</i> in Collage's administrator permissions.`
            : `<b>Collage is connected.</b>\n${pinGuidance}`,
      );
    }
  };

  bot.command("collage", (ctx) => renderStatus(ctx));
  bot.command("status", (ctx) => renderStatus(ctx));
  bot.command("rules", (ctx) => renderStatus(ctx, "rules"));
  bot.command("ask", (ctx) => handleAssistant(ctx, ctx.msg.text));
  bot.command("help", async (ctx) => {
    await sendHtml(
      ctx.api,
      ctx.chat.id,
      "<b>Collage commands</b>\n/collage — create or open the group Collage\n/status — refresh the current status\n/rules — review the current rules\n/ask — ask a Collage question\n/help — show this guide",
      undefined,
      ctx.message?.message_id,
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
    const mentionsBot = mentionDetected(ctx, username);
    const repliesToBot = ctx.message.reply_to_message?.from?.id === ctx.me.id;
    if (
      mentionsBot ||
      (repliesToBot && looksLikeAssistantQuestion(ctx.message.text))
    ) {
      if (!(await handleAssistant(ctx, ctx.message.text)))
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
