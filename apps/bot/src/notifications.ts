import { randomUUID } from "node:crypto";

import {
  createWorker,
  telegramNotificationJobSchema,
  type QueueWorker,
  type createRedisConnection,
  type TelegramNotificationJob,
} from "@collage/queue";
import { buildTelegramMiniAppLink } from "@collage/telegram";
import { InlineKeyboard, type Api, type Bot } from "grammy";

import type { InternalTelegramApi } from "./internal-api.js";

type RedisConnection = ReturnType<typeof createRedisConnection>;

const claimScript = `
if redis.call("EXISTS", KEYS[1]) == 1 then return 0 end
redis.call("SET", KEYS[1], ARGV[1], "PX", ARGV[2])
return 1
`;
const completeScript = `
if redis.call("GET", KEYS[1]) ~= ARGV[1] then return 0 end
redis.call("SET", KEYS[1], "sent", "EX", ARGV[2])
return 1
`;
const releaseScript = `
if redis.call("GET", KEYS[1]) ~= ARGV[1] then return 0 end
return redis.call("DEL", KEYS[1])
`;

export class RedisNotificationDeduplicator {
  constructor(
    readonly redis: RedisConnection,
    readonly claimMilliseconds = 300_000,
    readonly retentionSeconds = 7_776_000,
  ) {}

  async claim(deliveryId: string): Promise<string | null> {
    const token = randomUUID();
    const result = await this.redis.eval(
      claimScript,
      1,
      `collage:telegram:delivery:${deliveryId}`,
      token,
      String(this.claimMilliseconds),
    );
    return result === 1 ? token : null;
  }

  async complete(deliveryId: string, token: string): Promise<void> {
    await this.redis.eval(
      completeScript,
      1,
      `collage:telegram:delivery:${deliveryId}`,
      token,
      String(this.retentionSeconds),
    );
  }

  async release(deliveryId: string, token: string): Promise<void> {
    await this.redis.eval(
      releaseScript,
      1,
      `collage:telegram:delivery:${deliveryId}`,
      token,
    );
  }
}

const keyboard = (
  buttons: TelegramNotificationJob["buttons"],
): InlineKeyboard | undefined => {
  if (buttons.length === 0) return undefined;
  const result = new InlineKeyboard();
  for (const button of buttons) result.url(button.label, button.url).row();
  return result;
};

const deliver = async (
  api: Api,
  internalApi: InternalTelegramApi,
  job: TelegramNotificationJob,
  botUsername: string,
): Promise<void> => {
  if (job.operation === "refresh-status-card") {
    const card = await internalApi.getStatusCard(job.telegramChatId);
    const markup = card.buttons.length === 0 ? undefined : new InlineKeyboard();
    for (const button of card.buttons) {
      markup?.url(
        button.label,
        "startAppToken" in button
          ? buildTelegramMiniAppLink({
              botUsername,
              startAppToken: button.startAppToken,
              mode: "compact",
            })
          : button.url,
      );
      markup?.row();
    }
    const sent = await api.sendMessage(job.telegramChatId, card.text, {
      parse_mode: card.parseMode,
      link_preview_options: { is_disabled: true },
      ...(markup === undefined ? {} : { reply_markup: markup }),
    });
    if (card.pin) {
      await api.pinChatMessage(job.telegramChatId, sent.message_id, {
        disable_notification: true,
      });
      await internalApi.recordPinned({
        telegramChatId: job.telegramChatId,
        messageId: String(sent.message_id),
      });
    }
    return;
  }
  const actionToken =
    job.actionButton === undefined
      ? undefined
      : await internalApi.createLaunchToken({
          action: job.actionButton.action,
          chatId: job.actionButton.chatId,
          collageId: job.actionButton.collageId,
        });
  const markup = keyboard([
    ...job.buttons,
    ...(job.actionButton === undefined || actionToken === undefined
      ? []
      : [
          {
            label: job.actionButton.label,
            url: buildTelegramMiniAppLink({
              botUsername,
              startAppToken: actionToken.token,
              mode: "compact",
            }),
          },
        ]),
  ]);
  const common = {
    parse_mode: job.parseMode,
    link_preview_options: { is_disabled: true },
    ...(markup === undefined ? {} : { reply_markup: markup }),
  } as const;
  if (job.operation === "edit-pinned-status") {
    if (job.telegramMessageId === undefined) {
      throw new Error("Pinned-status edit requires telegramMessageId");
    }
    await api.editMessageText(
      job.telegramChatId,
      Number(job.telegramMessageId),
      job.text,
      common,
    );
    return;
  }
  const sent = await api.sendMessage(job.telegramChatId, job.text, common);
  if (job.operation === "pin-status-message") {
    await api.pinChatMessage(job.telegramChatId, sent.message_id, {
      disable_notification: true,
    });
    await internalApi.recordPinned({
      telegramChatId: job.telegramChatId,
      messageId: String(sent.message_id),
    });
  }
};

export const createTelegramNotificationWorker = (options: {
  readonly bot: Bot;
  readonly botUsername: string;
  readonly internalApi: InternalTelegramApi;
  readonly redis: RedisConnection;
  readonly concurrency: number;
}): QueueWorker<TelegramNotificationJob> => {
  const deduplicator = new RedisNotificationDeduplicator(options.redis);
  return createWorker<TelegramNotificationJob>(
    "telegram-notifications",
    options.redis,
    async (bullJob) => {
      const job = telegramNotificationJobSchema.parse(bullJob.data);
      const token = await deduplicator.claim(job.deliveryId);
      if (token === null) return;
      try {
        await deliver(
          options.bot.api,
          options.internalApi,
          job,
          options.botUsername,
        );
        await deduplicator.complete(job.deliveryId, token);
      } catch (error) {
        await deduplicator.release(job.deliveryId, token);
        throw error;
      }
    },
    { concurrency: options.concurrency },
  );
};
