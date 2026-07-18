import { SmsGateError } from "./types.js";

export type SmsGateOperation = "authenticate" | "refresh" | "send" | "status";

export interface SmsGateTransportRequest {
  readonly body?: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly method: "GET" | "POST";
  readonly operation: SmsGateOperation;
  readonly timeoutMilliseconds: number;
  readonly url: string;
}

export interface SmsGateTransportResponse {
  readonly body: unknown;
  readonly status: number;
}

export interface SmsGateTransport {
  request(request: SmsGateTransportRequest): Promise<SmsGateTransportResponse>;
}

export class FetchSmsGateTransport implements SmsGateTransport {
  async request(
    request: SmsGateTransportRequest,
  ): Promise<SmsGateTransportResponse> {
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
      const sendOutcomeUnknown = request.operation === "send";
      throw new SmsGateError({
        code: timeout ? "SMSGATE_TIMEOUT" : "SMSGATE_NETWORK_ERROR",
        kind: timeout ? "timeout" : "retryable",
        message: sendOutcomeUnknown
          ? "SMSGate send outcome is unknown; automatic resend is disabled."
          : timeout
            ? "SMSGate request timed out."
            : "SMSGate could not be reached.",
        outcomeUnknown: sendOutcomeUnknown,
        retryable: !sendOutcomeUnknown,
      });
    }

    const text = await response.text();
    let body: unknown = {};
    if (text.length > 0) {
      try {
        body = JSON.parse(text);
      } catch {
        throw new SmsGateError({
          code: "SMSGATE_INVALID_RESPONSE",
          kind: "unknown",
          message: "SMSGate returned a non-JSON response.",
          outcomeUnknown: request.operation === "send",
          retryable: false,
          status: response.status,
        });
      }
    }
    return { body, status: response.status };
  }
}
