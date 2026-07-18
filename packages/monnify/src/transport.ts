import { classifyProviderError } from "./status.js";
import { MonnifyError } from "./types.js";

export interface MonnifyTransportRequest {
  readonly body?: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly method: "GET" | "POST";
  readonly timeoutMilliseconds: number;
  readonly url: string;
}

export interface MonnifyTransportResponse {
  readonly body: unknown;
  readonly status: number;
}

export interface MonnifyTransport {
  request(request: MonnifyTransportRequest): Promise<MonnifyTransportResponse>;
}

export class FetchMonnifyTransport implements MonnifyTransport {
  async request(
    request: MonnifyTransportRequest,
  ): Promise<MonnifyTransportResponse> {
    let response: Response;
    try {
      response = await fetch(request.url, {
        method: request.method,
        headers: request.headers,
        ...(request.body === undefined ? {} : { body: request.body }),
        signal: AbortSignal.timeout(request.timeoutMilliseconds),
      });
    } catch (error) {
      const timeout =
        error instanceof DOMException && error.name === "TimeoutError";
      throw new MonnifyError({
        code: timeout ? "PROVIDER_TIMEOUT" : "PROVIDER_NETWORK_ERROR",
        kind: timeout ? "timeout" : "retryable",
        message: timeout
          ? "Monnify request timed out; the outcome is unknown."
          : "Monnify could not be reached.",
        retryable: !timeout,
      });
    }
    const text = await response.text();
    let body: unknown = {};
    if (text.length > 0) {
      try {
        body = JSON.parse(text);
      } catch {
        throw new MonnifyError({
          code: "INVALID_PROVIDER_RESPONSE",
          kind: "unknown",
          message: "Monnify returned a non-JSON response.",
          retryable: false,
          status: response.status,
        });
      }
    }
    if (!response.ok) {
      const envelope =
        typeof body === "object" && body !== null
          ? (body as Record<string, unknown>)
          : {};
      throw new MonnifyError(
        classifyProviderError(
          response.status,
          typeof envelope.responseCode === "string"
            ? envelope.responseCode
            : `HTTP_${String(response.status)}`,
          typeof envelope.responseMessage === "string"
            ? envelope.responseMessage
            : "Monnify request failed.",
        ),
      );
    }
    return { status: response.status, body };
  }
}
