import { z } from "zod";

import {
  FetchSmsGateTransport,
  type SmsGateOperation,
  type SmsGateTransport,
  type SmsGateTransportResponse,
} from "./transport.js";
import {
  SmsGateError,
  type SmsGateConfig,
  type SmsGateMessageResult,
  type SmsGateMessageState,
  type SmsGateSendMessageInput,
} from "./types.js";

const messageStateSchema = z.enum([
  "Pending",
  "Processed",
  "Sent",
  "Delivered",
  "Failed",
]);

const messageResponseSchema = z.object({
  deviceId: z.string().min(1).max(21),
  id: z.string().min(1).max(36),
  recipients: z
    .array(
      z.object({
        phoneNumber: z.string().min(1).max(128),
        state: messageStateSchema,
      }),
    )
    .min(1),
  state: messageStateSchema,
});

const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  expires_at: z.string().min(1),
  id: z.string().min(1),
  refresh_token: z.string().min(1),
  token_type: z.literal("Bearer"),
});

const errorResponseSchema = z.object({
  code: z.number().int().optional(),
  message: z.string().optional(),
});

interface SmsGateToken {
  readonly accessToken: string;
  readonly expiresAt: Date;
  readonly refreshToken: string;
}

const basicAuthorization = (username: string, password: string): string =>
  `Basic ${Buffer.from(`${username}:${password}`, "utf8").toString("base64")}`;

const endpoint = (baseUrl: string, path: string): string =>
  new URL(
    path.replace(/^\//u, ""),
    `${baseUrl.replace(/\/$/u, "")}/`,
  ).toString();

const parseToken = (body: unknown): SmsGateToken => {
  const parsed = tokenResponseSchema.safeParse(body);
  if (!parsed.success) {
    throw new SmsGateError({
      code: "SMSGATE_INVALID_TOKEN_RESPONSE",
      kind: "unknown",
      message: "SMSGate returned an invalid token response.",
      outcomeUnknown: false,
      retryable: false,
    });
  }
  const value = parsed.data;
  const expiresAt = new Date(value.expires_at);
  if (Number.isNaN(expiresAt.getTime())) {
    throw new SmsGateError({
      code: "SMSGATE_INVALID_TOKEN_EXPIRY",
      kind: "unknown",
      message: "SMSGate returned an invalid token expiry.",
      outcomeUnknown: false,
      retryable: false,
    });
  }
  return {
    accessToken: value.access_token,
    expiresAt,
    refreshToken: value.refresh_token,
  };
};

const parseMessage = (
  body: unknown,
  outcomeUnknown: boolean,
): SmsGateMessageResult => {
  const parsed = messageResponseSchema.safeParse(body);
  if (!parsed.success) {
    throw new SmsGateError({
      code: "SMSGATE_INVALID_MESSAGE_RESPONSE",
      kind: "unknown",
      message: outcomeUnknown
        ? "SMSGate accepted the send but returned an invalid response; the outcome is unknown."
        : "SMSGate returned an invalid message response.",
      outcomeUnknown,
      retryable: false,
    });
  }
  return {
    deviceId: parsed.data.deviceId,
    id: parsed.data.id,
    state: parsed.data.state,
  };
};

const classifyHttpError = (
  response: SmsGateTransportResponse,
  operation: SmsGateOperation,
): SmsGateError => {
  const parsed = errorResponseSchema.safeParse(response.body);
  const providerCode = parsed.success ? parsed.data.code : undefined;
  const providerMessage = parsed.success ? parsed.data.message : undefined;
  const status = response.status;
  const outcomeUnknown = operation === "send" && status >= 500;
  const code =
    providerCode === undefined
      ? `SMSGATE_HTTP_${String(status)}`
      : `SMSGATE_${String(providerCode)}`;
  const common = {
    code,
    message: outcomeUnknown
      ? "SMSGate send outcome is unknown; automatic resend is disabled."
      : (providerMessage ?? "SMSGate request failed."),
    outcomeUnknown,
    status,
  } as const;

  if (status === 401 || status === 403) {
    return new SmsGateError({
      ...common,
      kind: "authentication",
      retryable: false,
    });
  }
  if (status === 409) {
    return new SmsGateError({
      ...common,
      kind: "conflict",
      retryable: false,
    });
  }
  if (status === 429) {
    return new SmsGateError({
      ...common,
      kind: "rate_limited",
      retryable: operation !== "send",
    });
  }
  if (status >= 500) {
    return new SmsGateError({
      ...common,
      kind: "retryable",
      retryable: operation !== "send",
    });
  }
  if (status >= 400) {
    return new SmsGateError({
      ...common,
      kind: "invalid_request",
      retryable: false,
    });
  }
  return new SmsGateError({
    ...common,
    kind: "unknown",
    retryable: false,
  });
};

const assertSuccess = (
  response: SmsGateTransportResponse,
  expectedStatus: number,
  operation: SmsGateOperation,
): unknown => {
  if (response.status !== expectedStatus) {
    throw classifyHttpError(response, operation);
  }
  return response.body;
};

export class SmsGateClient {
  readonly #timeoutMilliseconds: number;
  readonly #tokenTtlSeconds: number;
  #refreshingToken: Promise<SmsGateToken> | undefined;
  #token: SmsGateToken | null = null;

  constructor(
    private readonly config: SmsGateConfig,
    private readonly transport: SmsGateTransport = new FetchSmsGateTransport(),
  ) {
    if (
      config.deploymentMode === "local" &&
      config.authenticationMode !== "basic"
    ) {
      throw new SmsGateError({
        code: "SMSGATE_INVALID_AUTH_MODE",
        kind: "invalid_request",
        message: "SMSGate Local Server supports Basic authentication only.",
        outcomeUnknown: false,
        retryable: false,
      });
    }
    this.#timeoutMilliseconds = config.timeoutMilliseconds ?? 10_000;
    this.#tokenTtlSeconds = config.tokenTtlSeconds ?? 3_600;
  }

  async sendMessage(
    input: SmsGateSendMessageInput,
  ): Promise<SmsGateMessageResult> {
    const requestBody = {
      id: z.string().min(1).max(36).parse(input.id),
      phoneNumbers: [
        z
          .string()
          .regex(/^\+[1-9]\d{7,14}$/u)
          .parse(input.phoneNumber),
      ],
      textMessage: { text: z.string().min(1).max(65_535).parse(input.text) },
      ttl: z.number().int().min(5).parse(input.ttlSeconds),
      ...(input.deviceId === undefined
        ? {}
        : { deviceId: z.string().min(1).max(21).parse(input.deviceId) }),
      ...(input.simNumber === undefined
        ? {}
        : { simNumber: z.number().int().min(1).max(3).parse(input.simNumber) }),
      ...(input.priority === undefined
        ? {}
        : {
            priority: z.number().int().min(-128).max(127).parse(input.priority),
          }),
      ...(input.withDeliveryReport === undefined
        ? {}
        : { withDeliveryReport: input.withDeliveryReport }),
    };
    const body = JSON.stringify(requestBody);
    let authorization = await this.#authorization();
    let response = await this.#request(
      "POST",
      this.#messagePath(),
      "send",
      authorization,
      body,
    );

    if (response.status === 401 && this.config.authenticationMode === "jwt") {
      this.#token = await this.#refreshToken();
      authorization = `Bearer ${this.#token.accessToken}`;
      response = await this.#request(
        "POST",
        this.#messagePath(),
        "send",
        authorization,
        body,
      );
    }

    return parseMessage(assertSuccess(response, 202, "send"), true);
  }

  async getMessage(id: string): Promise<SmsGateMessageResult> {
    const safeId = z.string().min(1).max(36).parse(id);
    const response = await this.#request(
      "GET",
      `${this.#messagePath()}/${encodeURIComponent(safeId)}`,
      "status",
      await this.#authorization(),
    );
    return parseMessage(assertSuccess(response, 200, "status"), false);
  }

  async #authorization(): Promise<string> {
    if (this.config.authenticationMode === "basic") {
      return basicAuthorization(this.config.username, this.config.password);
    }
    const token = await this.#getToken();
    return `Bearer ${token.accessToken}`;
  }

  async #getToken(now = new Date()): Promise<SmsGateToken> {
    if (
      this.#token !== null &&
      this.#token.expiresAt.getTime() - now.getTime() > 60_000
    ) {
      return this.#token;
    }
    return this.#refreshToken();
  }

  async #refreshToken(): Promise<SmsGateToken> {
    if (this.#refreshingToken === undefined) {
      this.#refreshingToken = this.#renewToken();
    }
    try {
      this.#token = await this.#refreshingToken;
      return this.#token;
    } finally {
      this.#refreshingToken = undefined;
    }
  }

  async #renewToken(): Promise<SmsGateToken> {
    if (this.#token !== null) {
      const response = await this.#request(
        "POST",
        "auth/token/refresh",
        "refresh",
        `Bearer ${this.#token.refreshToken}`,
      );
      if (response.status === 201) {
        return parseToken(response.body);
      }
      if (response.status !== 401 && response.status !== 403) {
        throw classifyHttpError(response, "refresh");
      }
    }
    const response = await this.#request(
      "POST",
      "auth/token",
      "authenticate",
      basicAuthorization(this.config.username, this.config.password),
      JSON.stringify({
        scopes: ["messages:send", "messages:read"],
        ttl: this.#tokenTtlSeconds,
      }),
    );
    return parseToken(assertSuccess(response, 201, "authenticate"));
  }

  #request(
    method: "GET" | "POST",
    path: string,
    operation: SmsGateOperation,
    authorization: string,
    body?: string,
  ): Promise<SmsGateTransportResponse> {
    return this.transport.request({
      method,
      operation,
      url: endpoint(this.config.apiBaseUrl, path),
      headers: {
        authorization,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(body === undefined ? {} : { body }),
      timeoutMilliseconds: this.#timeoutMilliseconds,
    });
  }

  #messagePath(): "message" | "messages" {
    return this.config.deploymentMode === "local" ? "message" : "messages";
  }
}

export const isTerminalSmsGateState = (state: SmsGateMessageState): boolean =>
  state === "Delivered" || state === "Failed";
