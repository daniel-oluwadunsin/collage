import { createHmac, timingSafeEqual } from "node:crypto";

import { z } from "zod";

const telegramUserSchema = z.object({
  id: z.number().int(),
  is_bot: z.boolean().optional(),
  first_name: z.string().min(1),
  last_name: z.string().optional(),
  username: z.string().optional(),
  language_code: z.string().optional(),
  is_premium: z.boolean().optional(),
  allows_write_to_pm: z.boolean().optional(),
  photo_url: z.url().optional(),
});

export type TelegramInitUser = z.infer<typeof telegramUserSchema>;

export interface VerifiedTelegramInitData {
  readonly authDate: Date;
  readonly queryId?: string;
  readonly user: TelegramInitUser;
}

const safeHexEqual = (left: string, right: string): boolean => {
  if (!/^[\da-f]{64}$/iu.test(left) || !/^[\da-f]{64}$/iu.test(right)) {
    return false;
  }
  return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
};

export const verifyTelegramInitData = (
  initData: string,
  botToken: string,
  options: {
    readonly maxAgeSeconds?: number;
    readonly maxFutureSkewSeconds?: number;
    readonly now?: Date;
  } = {},
): VerifiedTelegramInitData => {
  const parameters = new URLSearchParams(initData);
  const seen = new Set<string>();
  for (const key of parameters.keys()) {
    if (seen.has(key)) {
      throw new Error(`Duplicate Telegram init-data field: ${key}`);
    }
    seen.add(key);
  }
  const receivedHash = parameters.get("hash");
  const authDateValue = parameters.get("auth_date");
  const userValue = parameters.get("user");
  if (receivedHash === null || authDateValue === null || userValue === null) {
    throw new Error("Telegram init data is missing required fields");
  }

  parameters.delete("hash");
  const dataCheckString = [...parameters.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secretKey = createHmac("sha256", "WebAppData")
    .update(botToken)
    .digest();
  const expectedHash = createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex");
  if (!safeHexEqual(receivedHash, expectedHash)) {
    throw new Error("Telegram init-data signature is invalid");
  }

  const authDateSeconds = Number(authDateValue);
  if (!Number.isSafeInteger(authDateSeconds)) {
    throw new Error("Telegram init-data auth_date is invalid");
  }
  const nowSeconds = Math.floor((options.now ?? new Date()).getTime() / 1000);
  if (
    authDateSeconds > nowSeconds + (options.maxFutureSkewSeconds ?? 30) ||
    nowSeconds - authDateSeconds > (options.maxAgeSeconds ?? 300)
  ) {
    throw new Error("Telegram init data has expired or is not yet valid");
  }

  const queryId = parameters.get("query_id");
  return {
    authDate: new Date(authDateSeconds * 1000),
    user: telegramUserSchema.parse(JSON.parse(userValue)),
    ...(queryId === null ? {} : { queryId }),
  };
};
