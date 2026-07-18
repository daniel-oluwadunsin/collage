import { randomUUID } from "node:crypto";

import {
  createWorker,
  telegramNotificationJobSchema,
  type QueueWorker,
  type createRedisConnection,
  type TelegramNotificationJob,
} from "@collage/queue";
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
): Promise<void> => {
  const markup = keyboard(job.buttons);
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
        await deliver(options.bot.api, options.internalApi, job);
        await deduplicator.complete(job.deliveryId, token);
      } catch (error) {
        await deduplicator.release(job.deliveryId, token);
        throw error;
      }
    },
    { concurrency: options.concurrency },
  );
};
