"use client";

import { z, type ZodType } from "zod";

const envelopeSchema = z.object({
  success: z.literal(true),
  data: z.unknown(),
  requestId: z.string(),
});

const errorEnvelopeSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
    requestId: z.string().optional(),
  }),
  requestId: z.string().optional(),
});

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface ApiTransport {
  request<T>(
    path: string,
    schema: ZodType<T>,
    options?: RequestInit,
  ): Promise<T>;
}

const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/u, "") ??
  "https://7bd1-84-17-45-159.ngrok-free.app/v1";

export class HttpApiTransport implements ApiTransport {
  constructor(private readonly getToken: () => string | null) {}

  async request<T>(
    path: string,
    schema: ZodType<T>,
    options: RequestInit = {},
  ): Promise<T> {
    const token = this.getToken();
    const headers = new Headers(options.headers);
    headers.set("accept", "application/json");
    if (options.body !== undefined)
      headers.set("content-type", "application/json");
    if (token !== null) headers.set("authorization", `Bearer ${token}`);
    const response = await fetch(`${apiBaseUrl}${path}`, {
      ...options,
      headers,
    });
    const raw: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const parsed = errorEnvelopeSchema.safeParse(raw);
      throw new ApiError(
        response.status,
        parsed.success ? parsed.data.error.code : "REQUEST_FAILED",
        parsed.success
          ? parsed.data.error.message
          : "Collage could not complete this request.",
        parsed.success
          ? (parsed.data.error.requestId ?? parsed.data.requestId)
          : undefined,
      );
    }
    const envelope = envelopeSchema.safeParse(raw);
    if (!envelope.success) {
      throw new ApiError(
        502,
        "INVALID_API_RESPONSE",
        "Collage received an invalid server response.",
      );
    }
    const parsed = schema.safeParse(envelope.data.data);
    if (!parsed.success) {
      throw new ApiError(
        502,
        "INVALID_API_RESPONSE",
        "Collage received an unexpected server response.",
      );
    }
    return parsed.data;
  }
}

export const json = (value: unknown): RequestInit => ({
  body: JSON.stringify(value),
  method: "POST",
});

export const putJson = (value: unknown): RequestInit => ({
  body: JSON.stringify(value),
  method: "PUT",
});

export const createIdempotencyKey = (): string => crypto.randomUUID();
