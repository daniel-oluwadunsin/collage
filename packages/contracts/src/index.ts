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

const telegramIdentityReferenceFields = {
  telegramUserId: z.string().regex(/^\d+$/u).optional(),
  username: z.string().trim().min(1).max(64).optional(),
  displayName: z.string().trim().min(1).max(160).optional(),
} as const;

const hasTelegramIdentityReference = (value: {
  readonly telegramUserId?: string | undefined;
  readonly username?: string | undefined;
  readonly displayName?: string | undefined;
}) =>
  value.telegramUserId !== undefined ||
  value.username !== undefined ||
  value.displayName !== undefined;

const telegramIdentityReferenceSchema = z
  .object(telegramIdentityReferenceFields)
  .strict()
  .refine(
    hasTelegramIdentityReference,
    "A Telegram identity reference must contain a trusted identifier",
  );

export const assistantQueryRequestSchema = z
  .object({
    telegramChatId: z.string().regex(/^-?\d+$/u),
    actorTelegramUserId: z.string().regex(/^\d+$/u).optional(),
    actorTelegramUsername: z.string().trim().min(1).max(64).optional(),
    actorDisplayName: z.string().trim().min(1).max(160).optional(),
    telegramMessageId: z.number().int().positive(),
    telegramMessageThreadId: z.number().int().positive().optional(),
    text: z.string().trim().min(1).max(4_096),
    replyTarget: telegramIdentityReferenceSchema.optional(),
    mentions: z
      .array(
        z
          .object({
            ...telegramIdentityReferenceFields,
            reference: z.string().regex(/^MENTION_[1-9]\d*$/u),
          })
          .strict()
          .refine(
            hasTelegramIdentityReference,
            "A mention must contain a trusted identifier",
          ),
      )
      .max(10),
    sentAnonymously: z.boolean(),
  })
  .strict()
  .superRefine((value, context) => {
    if (!value.sentAnonymously && value.actorTelegramUserId === undefined) {
      context.addIssue({
        code: "custom",
        path: ["actorTelegramUserId"],
        message: "A non-anonymous assistant request requires the sender ID",
      });
    }
    if (
      value.sentAnonymously &&
      (value.actorTelegramUserId !== undefined ||
        value.actorTelegramUsername !== undefined ||
        value.actorDisplayName !== undefined)
    ) {
      context.addIssue({
        code: "custom",
        path: ["sentAnonymously"],
        message: "Anonymous requests cannot include actor identity fields",
      });
    }
    if (
      new Set(value.mentions.map(({ reference }) => reference)).size !==
      value.mentions.length
    ) {
      context.addIssue({
        code: "custom",
        path: ["mentions"],
        message: "Mention references must be unique",
      });
    }
  });

export const assistantQueryResponseSchema = z
  .object({
    text: z.string().min(1).max(4_096),
    parseMode: z.literal("HTML"),
    disableLinkPreview: z.boolean().optional(),
    replyToMessageId: z.number().int().positive(),
    messageThreadId: z.number().int().positive().optional(),
    buttons: z
      .array(
        z
          .array(
            z
              .object({
                label: z.string().min(1).max(64),
                url: z.url().refine((value) => value.startsWith("https://")),
              })
              .strict(),
          )
          .min(1)
          .max(8),
      )
      .max(8)
      .optional(),
  })
  .strict();

export type AssistantQueryRequest = z.infer<typeof assistantQueryRequestSchema>;
export type AssistantQueryResponse = z.infer<
  typeof assistantQueryResponseSchema
>;

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
