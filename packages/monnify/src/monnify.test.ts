import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";

import {
  classifyProviderError,
  mapMandateStatus,
  mapPaymentStatus,
  mapTransferStatus,
  MonnifyClient,
  normalizeMonnifyWebhook,
  validateMonnifyWebhook,
  type MonnifyTransport,
  type MonnifyTransportRequest,
  type MonnifyTransportResponse,
} from "./index.js";

class FixtureTransport implements MonnifyTransport {
  readonly requests: MonnifyTransportRequest[] = [];

  constructor(private readonly responses: MonnifyTransportResponse[]) {}

  request(
    providerRequest: MonnifyTransportRequest,
  ): Promise<MonnifyTransportResponse> {
    this.requests.push(providerRequest);
    const response = this.responses.shift();
    if (response === undefined) {
      return Promise.reject(new Error("No fixture response configured"));
    }
    return Promise.resolve(response);
  }
}

const success = (responseBody: unknown): MonnifyTransportResponse => ({
  status: 200,
  body: {
    requestSuccessful: true,
    responseCode: "0",
    responseMessage: "success",
    responseBody,
  },
});

const token = success({ accessToken: "fixture-access-token", expiresIn: 3600 });

const config = {
  apiKey: "MK_TEST_FIXTURE",
  secretKey: "SK_TEST_FIXTURE",
  contractCode: "0000000000",
  baseUrl: "https://sandbox.monnify.com",
  sourceWalletAccountNumber: "9999999999",
};

void test("initializes checkout with exact decimal JSON and unique reference", async () => {
  const transport = new FixtureTransport([
    token,
    success({
      checkoutUrl: "https://sandbox.monnify.com/checkout/fixture",
      paymentReference: "payment-1",
      transactionReference: "MNFY|fixture",
    }),
  ]);
  const client = new MonnifyClient(config, transport);
  const result = await client.initializeCheckout({
    amountMinor: 123_45n,
    customerEmail: "fixture@example.test",
    paymentReference: "payment-1",
    paymentDescription: "Fixture",
    redirectUrl: "https://app.example.test/payment-return",
    metadata: { attemptId: "attempt-id" },
  });
  assert.equal(result.paymentReference, "payment-1");
  assert.match(transport.requests[1]?.body ?? "", /"amount":123\.45/u);
  assert.doesNotMatch(transport.requests[1]?.body ?? "", /"amount":"123\.45"/u);
});

void test("verifies payment and returns token only from server verification", async () => {
  const transport = new FixtureTransport([
    token,
    success({
      amountPaid: 5000,
      currency: "NGN",
      paymentMethod: "CARD",
      paymentReference: "payment-2",
      paymentStatus: "PAID",
      transactionReference: "MNFY|paid",
      cardDetails: { cardToken: "sensitive-fixture-token" },
    }),
  ]);
  const result = await new MonnifyClient(
    config,
    transport,
  ).verifyTransactionByPaymentReference("payment-2");
  assert.equal(result.amountPaidMinor, 500_000n);
  assert.equal(result.outcome, "paid");
  assert.equal(result.cardToken, "sensitive-fixture-token");
});

void test("normalizes documented statuses and fails unknown states safely", () => {
  assert.equal(mapPaymentStatus("PAID"), "paid");
  assert.equal(mapPaymentStatus("NEW_STATUS"), "unknown");
  assert.equal(
    mapMandateStatus("PENDING AUTHORIZATION"),
    "pending_authorization",
  );
  assert.equal(
    mapTransferStatus("PENDING_AUTHORIZATION"),
    "pending_authorization",
  );
  assert.equal(mapTransferStatus("SUCCESS"), "successful");
  assert.equal(classifyProviderError(503, "99").retryable, true);
  assert.equal(classifyProviderError(409, "D05").kind, "conflict");
});

void test("validates production HMAC over exact bytes and explicit sandbox policy", () => {
  const rawBody = Buffer.from(
    JSON.stringify({
      eventType: "SUCCESSFUL_TRANSACTION",
      eventData: { transactionReference: "MNFY|fixture" },
    }),
  );
  const secretKey = "fixture-secret";
  const signature = createHmac("sha512", secretKey)
    .update(rawBody)
    .digest("hex");
  assert.equal(
    validateMonnifyWebhook(rawBody, {
      environment: "production",
      secretKey,
      signature,
    }),
    true,
  );
  assert.equal(
    validateMonnifyWebhook(Buffer.concat([rawBody, Buffer.from(" ")]), {
      environment: "production",
      secretKey,
      signature,
    }),
    false,
  );
  assert.equal(
    validateMonnifyWebhook(rawBody, {
      environment: "sandbox",
      secretKey,
      signature: undefined,
      allowUnsignedSandbox: false,
    }),
    false,
  );
  assert.equal(
    normalizeMonnifyWebhook(JSON.parse(rawBody.toString())).providerEventId,
    "MNFY|fixture",
  );
});

void test("uses documented collection, mandate, bank, and disbursement paths", async () => {
  const transport = new FixtureTransport([
    token,
    success([{ code: "001", name: "Fixture Bank" }]),
    success({
      accountName: "FIXTURE CUSTOMER",
      accountNumber: "0123456789",
      bankCode: "001",
    }),
    success({
      amountPaid: "50.00",
      paymentReference: "card-charge-1",
      paymentStatus: "PAID",
      transactionReference: "MNFY|card-charge",
    }),
    success({
      mandateCode: "mandate-code",
      mandateReference: "mandate-1",
      mandateStatus: "PENDING AUTHORIZATION",
      authorizationLink: "https://sandbox.monnify.com/mandate/fixture",
    }),
    success([
      {
        mandateCode: "mandate-code",
        mandateReference: "mandate-1",
        mandateStatus: "ACTIVE",
      },
    ]),
    success({
      paymentReference: "mandate-debit-1",
      paymentStatus: "PENDING",
      transactionReference: "MNFY|mandate-debit",
    }),
    success({
      paymentReference: "mandate-debit-1",
      paymentStatus: "PAID",
      transactionReference: "MNFY|mandate-debit",
    }),
    success({
      amount: "100.00",
      reference: "transfer-1",
      status: "PENDING_AUTHORIZATION",
      transactionReference: "MNFY|transfer",
    }),
    success({
      amount: "100.00",
      reference: "transfer-1",
      status: "SUCCESS",
      transactionReference: "MNFY|transfer",
    }),
    success({
      accountNumber: "9999999999",
      availableBalance: "1000.00",
      currency: "NGN",
      ledgerBalance: "1200.00",
    }),
  ]);
  const client = new MonnifyClient(config, transport);
  assert.equal((await client.getBanks())[0]?.code, "001");
  assert.equal(
    (await client.validateBankAccount("0123456789", "001")).accountName,
    "FIXTURE CUSTOMER",
  );
  assert.equal(
    (
      await client.chargeCardToken({
        cardToken: "fixture-card-token",
        transactionReference: "MNFY|card-charge",
      })
    ).outcome,
    "paid",
  );
  assert.equal(
    (
      await client.createMandate({
        amountMinor: 10_000n,
        autoRenew: false,
        customerAccountBankCode: "001",
        customerAccountNumber: "0123456789",
        customerAddress: "Fixture address",
        customerEmailAddress: "fixture@example.test",
        customerName: "Fixture Customer",
        customerPhoneNumber: "+2348000000000",
        endDate: "2027-07-18",
        mandateDescription: "Fixture mandate",
        mandateReference: "mandate-1",
        startDate: "2026-07-18",
      })
    ).outcome,
    "pending_authorization",
  );
  assert.equal(
    (await client.getMandateStatus("mandate-1")).outcome,
    "activated",
  );
  assert.equal(
    (
      await client.debitMandate({
        amountMinor: 10_000n,
        mandateReference: "mandate-1",
        narration: "Fixture debit",
        paymentReference: "mandate-debit-1",
      })
    ).outcome,
    "pending",
  );
  assert.equal(
    (await client.getMandateDebitStatus("mandate-debit-1")).outcome,
    "paid",
  );
  assert.equal(
    (
      await client.initiateTransfer({
        amountMinor: 10_000n,
        destinationAccountName: "Fixture Customer",
        destinationAccountNumber: "0123456789",
        destinationBankCode: "001",
        narration: "Fixture payout",
        reference: "transfer-1",
      })
    ).outcome,
    "pending_authorization",
  );
  assert.equal(
    (await client.getTransferStatus("transfer-1")).outcome,
    "successful",
  );
  assert.equal(
    (await client.getWalletBalance()).availableBalanceMinor,
    100_000n,
  );

  assert.deepEqual(
    transport.requests.slice(1).map(({ url }) => new URL(url).pathname),
    [
      "/api/v1/banks",
      "/api/v1/disbursements/account/validate",
      "/api/v1/merchant/cards/charge",
      "/api/v1/direct-debit/mandate/create",
      "/api/v1/direct-debit/mandate/",
      "/api/v1/direct-debit/mandate/debit",
      "/api/v1/direct-debit/mandate/debit-status",
      "/api/v2/disbursements/single",
      "/api/v2/disbursements/single/summary",
      "/api/v2/disbursements/wallet-balance",
    ],
  );
  assert.equal(
    transport.requests.every(({ headers }, index) =>
      index === 0
        ? headers.authorization?.startsWith("Basic ")
        : headers.authorization === "Bearer fixture-access-token",
    ),
    true,
  );
});
