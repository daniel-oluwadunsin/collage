import { z } from "zod";

export const healthResponseSchema = z.object({
  service: z.string().min(1),
  status: z.enum(["ok", "ready"]),
  timestamp: z.iso.datetime(),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;

export const telegramLaunchButtonSchema = z.object({
  label: z.string().min(1).max(64),
  startAppToken: z.string().min(20).max(512),
});

export const telegramUrlButtonSchema = z.object({
  label: z.string().min(1).max(64),
  url: z.url(),
});

export const telegramButtonSchema = z.union([
  telegramLaunchButtonSchema,
  telegramUrlButtonSchema,
]);

export const telegramStatusCardSchema = z.object({
  state: z.enum([
    "EMPTY",
    "DRAFT",
    "REGISTRATION_OPEN",
    "STARTING",
    "ACTIVE",
    "BLOCKED",
    "PAYOUT_PROCESSING",
    "COMPLETED",
    "SUSPENDED",
    "CANCELLED",
  ]),
  text: z.string().min(1).max(4_096),
  parseMode: z.literal("HTML"),
  buttons: z.array(telegramButtonSchema).max(8),
  pin: z.boolean(),
  replaceMessageId: z.string().regex(/^\d+$/u).nullable(),
});

export type TelegramButton = z.infer<typeof telegramButtonSchema>;
export type TelegramStatusCard = z.infer<typeof telegramStatusCardSchema>;

export type JsonPrimitive = boolean | null | number | string;
export type JsonValue =
  JsonPrimitive | readonly JsonValue[] | { readonly [key: string]: JsonValue };

export const serializeForDto = (value: unknown): JsonValue => {
  if (typeof value === "bigint") {
    return value.toString();
  }

  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "number" ||
    typeof value === "string"
  ) {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map(serializeForDto);
  }

  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [
        key,
        serializeForDto(nested),
      ]),
    );
  }

  throw new TypeError(`Cannot serialize ${typeof value} into a DTO`);
};
