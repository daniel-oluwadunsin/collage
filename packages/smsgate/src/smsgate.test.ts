import assert from "node:assert/strict";
import { test } from "node:test";

import {
  SmsGateClient,
  SmsGateError,
  SmsGateOtpProvider,
  type SmsGateTransport,
  type SmsGateTransportRequest,
  type SmsGateTransportResponse,
} from "./index.js";

class FixtureTransport implements SmsGateTransport {
  readonly requests: SmsGateTransportRequest[] = [];

  constructor(private readonly responses: SmsGateTransportResponse[]) {}

  request(
    providerRequest: SmsGateTransportRequest,
  ): Promise<SmsGateTransportResponse> {
    this.requests.push(providerRequest);
    const response = this.responses.shift();
    if (response === undefined) {
      return Promise.reject(
        new Error("No SMSGate fixture response configured"),
      );
    }
    return Promise.resolve(response);
  }
}

const token = (
  accessToken = "fixture-access",
  refreshToken = "fixture-refresh",
): SmsGateTransportResponse => ({
  status: 201,
  body: {
    id: `token-${accessToken}`,
    token_type: "Bearer",
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_at: "2099-01-01T00:00:00Z",
  },
});

const message = (
  id = "12345678-1234-1234-1234-123456789012",
  state = "Pending",
): SmsGateTransportResponse => ({
  status: 202,
  body: {
    deviceId: "device-fixture-1",
    id,
    recipients: [{ phoneNumber: "+2348012345678", state }],
    state,
  },
});

const jwtConfig = {
  apiBaseUrl: "https://api.sms-gate.app/3rdparty/v1",
  authenticationMode: "jwt" as const,
  deploymentMode: "cloud" as const,
  username: "fixture-user",
  password: "fixture-password",
};

const requireBody = (request: SmsGateTransportRequest): string => {
  if (request.body === undefined) {
    throw new Error("Expected fixture request body");
  }
  return request.body;
};

void test("authenticates with least privilege and enqueues an E.164 OTP", async () => {
  const transport = new FixtureTransport([token(), message()]);
  const client = new SmsGateClient(jwtConfig, transport);
  const delivery = await new SmsGateOtpProvider(client, {
    deviceId: "device-fixture-1",
    priority: 100,
    simNumber: 1,
    withDeliveryReport: true,
  }).send({
    code: "481516",
    expiresInSeconds: 600,
    idempotencyKey: "12345678-1234-1234-1234-123456789012",
    phone: "+2348012345678",
    purpose: "registration-phone",
  });
  assert.equal(delivery.outcome, "queued");

  const authenticationRequest = transport.requests[0];
  const sendRequest = transport.requests[1];
  assert.ok(authenticationRequest);
  assert.ok(sendRequest);
  assert.equal(authenticationRequest.url.endsWith("/auth/token"), true);
  assert.deepEqual(JSON.parse(requireBody(authenticationRequest)), {
    scopes: ["messages:send", "messages:read"],
    ttl: 3600,
  });
  assert.equal(sendRequest.url.endsWith("/messages"), true);
  const sent = JSON.parse(requireBody(sendRequest)) as {
    phoneNumbers?: unknown;
    textMessage?: { text?: string };
    ttl?: unknown;
    id?: unknown;
  };
  assert.deepEqual(sent.phoneNumbers, ["+2348012345678"]);
  assert.equal(sent.id, "12345678-1234-1234-1234-123456789012");
  assert.equal(sent.ttl, 600);
  assert.match(sent.textMessage?.text ?? "", /481516/u);
  assert.doesNotMatch(sendRequest.url, /skipPhoneValidation/u);
});

void test("supports local Basic authentication without requesting a JWT", async () => {
  const transport = new FixtureTransport([message("local-message")]);
  const client = new SmsGateClient(
    {
      apiBaseUrl: "http://192.168.1.20:8080",
      authenticationMode: "basic",
      deploymentMode: "local",
      username: "local-user",
      password: "local-password",
    },
    transport,
  );
  await client.sendMessage({
    id: "local-message",
    phoneNumber: "+2348012345678",
    text: "Fixture message",
    ttlSeconds: 60,
  });
  assert.equal(transport.requests.length, 1);
  const localRequest = transport.requests[0];
  assert.ok(localRequest);
  assert.equal(localRequest.url.endsWith("/message"), true);
  const authorization = localRequest.headers.authorization;
  assert.ok(authorization);
  assert.match(authorization, /^Basic /u);
});

void test("recovers once from expired JWT and reuses the message ID", async () => {
  const transport = new FixtureTransport([
    token("access-1", "refresh-1"),
    { status: 401, body: { code: 401, message: "expired" } },
    token("access-2", "refresh-2"),
    message("stable-message-id"),
  ]);
  const client = new SmsGateClient(jwtConfig, transport);
  await client.sendMessage({
    id: "stable-message-id",
    phoneNumber: "+2348012345678",
    text: "Fixture message",
    ttlSeconds: 60,
  });
  const sends = transport.requests.filter(
    (request) => request.operation === "send",
  );
  assert.equal(sends.length, 2);
  assert.equal(sends[0]?.body, sends[1]?.body);
  assert.equal(
    transport.requests[2]?.url.endsWith("/auth/token/refresh"),
    true,
  );
});

void test("does not retry an ambiguous server-side send failure", async () => {
  const transport = new FixtureTransport([
    {
      status: 503,
      body: { code: 503, message: "queue unavailable" },
    },
  ]);
  const client = new SmsGateClient(
    { ...jwtConfig, authenticationMode: "basic" },
    transport,
  );
  await assert.rejects(
    client.sendMessage({
      id: "unknown-outcome",
      phoneNumber: "+2348012345678",
      text: "Fixture message",
      ttlSeconds: 60,
    }),
    (error: unknown) =>
      error instanceof SmsGateError &&
      error.failure.outcomeUnknown &&
      !error.failure.retryable,
  );
  assert.equal(transport.requests.length, 1);
});

void test("reports an ambiguous OTP enqueue without claiming failure or success", async () => {
  const transport = new FixtureTransport([
    {
      status: 503,
      body: { code: 503, message: "queue unavailable" },
    },
  ]);
  const provider = new SmsGateOtpProvider(
    new SmsGateClient({ ...jwtConfig, authenticationMode: "basic" }, transport),
  );
  const delivery = await provider.send({
    code: "481516",
    expiresInSeconds: 600,
    idempotencyKey: "ambiguous-otp",
    phone: "+2348012345678",
    purpose: "registration-phone",
  });
  assert.equal(delivery.outcome, "unknown");
  assert.equal(transport.requests.length, 1);
});

void test("retrieves and preserves documented message states", async () => {
  const response = message("status-message", "Delivered");
  const transport = new FixtureTransport([{ ...response, status: 200 }]);
  const client = new SmsGateClient(
    { ...jwtConfig, authenticationMode: "basic" },
    transport,
  );
  const result = await client.getMessage("status-message");
  assert.equal(result.state, "Delivered");
  assert.equal(
    transport.requests[0]?.url.endsWith("/messages/status-message"),
    true,
  );
});
