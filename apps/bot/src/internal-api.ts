import {
  telegramStatusCardSchema,
  type TelegramStatusCard,
} from "@collage/contracts";
import { signInternalRequest } from "@collage/security";
import { z } from "zod";

const envelopeSchema = z.object({
  success: z.literal(true),
  data: z.unknown(),
  requestId: z.string(),
});

const membershipResultSchema = z.object({
  notification: z
    .object({
      text: z.string().min(1).max(4_096),
      parseMode: z.literal("HTML"),
      buttons: z.array(z.never()),
    })
    .nullable(),
});

export interface TelegramPerson {
  readonly firstName: string;
  readonly telegramChatId: string;
  readonly telegramUserId: string;
  readonly role:
    | "MEMBER"
    | "ADMINISTRATOR"
    | "CREATOR"
    | "RESTRICTED"
    | "LEFT"
    | "KICKED"
    | "UNKNOWN";
}

export interface InternalTelegramApi {
  upsertChat(input: {
    readonly telegramChatId: string;
    readonly title: string;
    readonly type: "GROUP" | "SUPERGROUP" | "CHANNEL";
    readonly username?: string;
    readonly botCanPinMessages: boolean;
  }): Promise<void>;
  getStatusCard(
    telegramChatId: string,
    variant?: "status" | "rules",
  ): Promise<TelegramStatusCard>;
  memberJoined(input: TelegramPerson): Promise<void>;
  memberLeft(input: TelegramPerson): Promise<{
    readonly notification: {
      readonly text: string;
      readonly parseMode: "HTML";
      readonly buttons: readonly never[];
    } | null;
  }>;
  botMembershipChanged(input: {
    readonly telegramChatId: string;
    readonly botCanPinMessages: boolean;
  }): Promise<void>;
  recordPinned(input: {
    readonly telegramChatId: string;
    readonly messageId: string;
  }): Promise<void>;
  createLaunchToken(input: {
    readonly action: "PAY_CONTRIBUTION";
    readonly chatId: string;
    readonly collageId: string;
  }): Promise<{ readonly token: string; readonly expiresInSeconds: number }>;
  ready(): Promise<boolean>;
}

export class SignedInternalTelegramClient implements InternalTelegramApi {
  readonly #baseUrl: URL;
  readonly #secret: Buffer;

  constructor(
    baseUrl: string,
    secret: string,
    readonly timeoutMilliseconds = 5_000,
    readonly fetchImplementation: typeof fetch = fetch,
  ) {
    this.#baseUrl = new URL(baseUrl);
    this.#secret = Buffer.from(secret, "utf8");
  }

  async #request(path: string, method: "GET" | "POST", input?: unknown) {
    const body = method === "POST" ? JSON.stringify(input ?? {}) : "";
    const headers = signInternalRequest(
      { method, path, body },
      "bot",
      this.#secret,
    );
    const response = await this.fetchImplementation(
      new URL(path, this.#baseUrl),
      {
        method,
        headers: {
          ...headers,
          accept: "application/json",
          ...(method === "POST" ? { "content-type": "application/json" } : {}),
        },
        ...(method === "POST" ? { body } : {}),
        signal: AbortSignal.timeout(this.timeoutMilliseconds),
      },
    );
    if (!response.ok) {
      throw new Error(
        `Internal Telegram API returned HTTP ${String(response.status)}`,
      );
    }
    return envelopeSchema.parse(await response.json()).data;
  }

  async upsertChat(
    input: Parameters<InternalTelegramApi["upsertChat"]>[0],
  ): Promise<void> {
    await this.#request("/internal/telegram/chats/upsert", "POST", input);
  }

  async getStatusCard(
    telegramChatId: string,
    variant: "status" | "rules" = "status",
  ): Promise<TelegramStatusCard> {
    const path = `/internal/telegram/chats/${encodeURIComponent(telegramChatId)}/status-card?variant=${variant}`;
    return telegramStatusCardSchema.parse(await this.#request(path, "GET"));
  }

  async memberJoined(input: TelegramPerson): Promise<void> {
    await this.#request(
      "/internal/telegram/events/member-joined",
      "POST",
      input,
    );
  }

  async memberLeft(
    input: TelegramPerson,
  ): ReturnType<InternalTelegramApi["memberLeft"]> {
    return membershipResultSchema.parse(
      await this.#request(
        "/internal/telegram/events/member-left",
        "POST",
        input,
      ),
    );
  }

  async botMembershipChanged(
    input: Parameters<InternalTelegramApi["botMembershipChanged"]>[0],
  ): Promise<void> {
    await this.#request(
      "/internal/telegram/events/bot-membership-changed",
      "POST",
      input,
    );
  }

  async recordPinned(
    input: Parameters<InternalTelegramApi["recordPinned"]>[0],
  ): Promise<void> {
    await this.#request("/internal/telegram/messages/pinned", "POST", input);
  }

  async createLaunchToken(
    input: Parameters<InternalTelegramApi["createLaunchToken"]>[0],
  ): ReturnType<InternalTelegramApi["createLaunchToken"]> {
    return z
      .object({
        token: z.string().min(20),
        expiresInSeconds: z.number().positive(),
      })
      .parse(
        await this.#request(
          "/internal/telegram/actions/create-launch-token",
          "POST",
          input,
        ),
      );
  }

  async ready(): Promise<boolean> {
    try {
      const response = await this.fetchImplementation(
        new URL("/health/ready", this.#baseUrl),
        { signal: AbortSignal.timeout(this.timeoutMilliseconds) },
      );
      return response.ok;
    } catch {
      return false;
    }
  }
}
