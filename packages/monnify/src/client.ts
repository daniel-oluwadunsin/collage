import { z } from "zod";

import { providerAmountToMinor, serializeProviderJson } from "./money.js";
import {
  classifyProviderError,
  mapMandateStatus,
  mapPaymentStatus,
  mapTransferStatus,
} from "./status.js";
import { FetchMonnifyTransport, type MonnifyTransport } from "./transport.js";
import {
  MonnifyError,
  type AccountValidation,
  type Bank,
  type CheckoutInitialization,
  type MandateDebitResult,
  type MandateResult,
  type TransactionVerification,
  type TransferResult,
  type WalletBalance,
} from "./types.js";

const envelopeSchema = z.object({
  requestSuccessful: z.boolean(),
  responseCode: z.union([z.string(), z.number()]).transform(String),
  responseMessage: z.string(),
  responseBody: z.unknown(),
});

const requiredString = z.string().min(1);

export interface MonnifyConfig {
  readonly apiKey: string;
  readonly baseUrl: string;
  readonly contractCode: string;
  readonly secretKey: string;
  readonly sourceWalletAccountNumber?: string;
  readonly timeoutMilliseconds?: number;
}

export interface MonnifyAccessToken {
  readonly expiresAt: Date;
  readonly value: string;
}

export interface MonnifyTokenStore {
  get(): Promise<MonnifyAccessToken | null>;
  set(token: MonnifyAccessToken): Promise<void>;
}

export class MemoryMonnifyTokenStore implements MonnifyTokenStore {
  #token: MonnifyAccessToken | null = null;

  get(): Promise<MonnifyAccessToken | null> {
    return Promise.resolve(this.#token);
  }

  set(token: MonnifyAccessToken): Promise<void> {
    this.#token = token;
    return Promise.resolve();
  }
}

const unwrap = <Output>(body: unknown, schema: z.ZodType<Output>): Output => {
  const envelope = envelopeSchema.parse(body);
  if (!envelope.requestSuccessful) {
    throw new MonnifyError(
      classifyProviderError(
        undefined,
        envelope.responseCode,
        envelope.responseMessage,
      ),
    );
  }
  return schema.parse(envelope.responseBody);
};

const addQuery = (
  baseUrl: string,
  path: string,
  query: Readonly<Record<string, string>>,
): string => {
  const url = new URL(path, `${baseUrl.replace(/\/$/u, "")}/`);
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
};

export class MonnifyClient {
  readonly #timeoutMilliseconds: number;
  #refreshingToken: Promise<MonnifyAccessToken> | undefined;

  constructor(
    private readonly config: MonnifyConfig,
    private readonly transport: MonnifyTransport = new FetchMonnifyTransport(),
    private readonly tokenStore: MonnifyTokenStore = new MemoryMonnifyTokenStore(),
  ) {
    this.#timeoutMilliseconds = config.timeoutMilliseconds ?? 10_000;
  }

  async authenticate(now = new Date()): Promise<MonnifyAccessToken> {
    const cached = await this.tokenStore.get();
    if (
      cached !== null &&
      cached.expiresAt.getTime() - now.getTime() > 60_000
    ) {
      return cached;
    }
    if (this.#refreshingToken !== undefined) {
      return this.#refreshingToken;
    }
    this.#refreshingToken = this.#fetchToken(now);
    try {
      return await this.#refreshingToken;
    } finally {
      this.#refreshingToken = undefined;
    }
  }

  async #fetchToken(now: Date): Promise<MonnifyAccessToken> {
    const authorization = Buffer.from(
      `${this.config.apiKey}:${this.config.secretKey}`,
      "utf8",
    ).toString("base64");
    const response = await this.transport.request({
      method: "POST",
      url: addQuery(this.config.baseUrl, "/api/v1/auth/login", {}),
      headers: { authorization: `Basic ${authorization}` },
      timeoutMilliseconds: this.#timeoutMilliseconds,
    });
    const body = unwrap(
      response.body,
      z.object({
        accessToken: requiredString,
        expiresIn: z.number().int().positive(),
      }),
    );
    const token = {
      value: body.accessToken,
      expiresAt: new Date(now.getTime() + body.expiresIn * 1_000),
    };
    await this.tokenStore.set(token);
    return token;
  }

  async #request(
    method: "GET" | "POST",
    path: string,
    options: {
      readonly body?: unknown;
      readonly query?: Readonly<Record<string, string>>;
    } = {},
  ): Promise<unknown> {
    const token = await this.authenticate();
    const response = await this.transport.request({
      method,
      url: addQuery(this.config.baseUrl, path, options.query ?? {}),
      headers: {
        authorization: `Bearer ${token.value}`,
        ...(options.body === undefined
          ? {}
          : { "content-type": "application/json" }),
      },
      ...(options.body === undefined
        ? {}
        : { body: serializeProviderJson(options.body) }),
      timeoutMilliseconds: this.#timeoutMilliseconds,
    });
    return response.body;
  }

  async initializeCheckout(input: {
    readonly amountMinor: bigint;
    readonly customerEmail: string;
    readonly customerName?: string;
    readonly metadata: Readonly<Record<string, string>>;
    readonly paymentDescription: string;
    readonly paymentMethods?: readonly (
      "ACCOUNT_TRANSFER" | "CARD" | "PHONE_NUMBER" | "USSD"
    )[];
    readonly paymentReference: string;
    readonly redirectUrl: string;
  }): Promise<CheckoutInitialization> {
    const response = await this.#request(
      "POST",
      "/api/v1/merchant/transactions/init-transaction",
      {
        body: {
          amount: input.amountMinor,
          customerEmail: input.customerEmail,
          customerName: input.customerName,
          paymentReference: input.paymentReference,
          paymentDescription: input.paymentDescription,
          currencyCode: "NGN",
          contractCode: this.config.contractCode,
          redirectUrl: input.redirectUrl,
          paymentMethods: input.paymentMethods ?? [
            "CARD",
            "ACCOUNT_TRANSFER",
            "USSD",
          ],
          metadata: input.metadata,
        },
      },
    );
    return unwrap(
      response,
      z.object({
        checkoutUrl: z.url(),
        paymentReference: requiredString,
        transactionReference: requiredString,
      }),
    );
  }

  async verifyTransactionByPaymentReference(
    paymentReference: string,
  ): Promise<TransactionVerification> {
    const response = await this.#request(
      "GET",
      "/api/v2/merchant/transactions/query",
      { query: { paymentReference } },
    );
    const body = unwrap(
      response,
      z.object({
        amountPaid: z.union([z.number(), z.string()]),
        currency: requiredString,
        paymentMethod: z.string().optional(),
        paymentReference: requiredString,
        paymentStatus: requiredString,
        transactionReference: requiredString,
        cardDetails: z
          .object({ cardToken: z.string().min(1).optional() })
          .optional(),
      }),
    );
    return {
      amountPaidMinor: providerAmountToMinor(body.amountPaid),
      currency: body.currency,
      outcome: mapPaymentStatus(body.paymentStatus),
      paymentReference: body.paymentReference,
      rawStatus: body.paymentStatus,
      transactionReference: body.transactionReference,
      ...(body.paymentMethod === undefined
        ? {}
        : { paymentMethod: body.paymentMethod }),
      ...(body.cardDetails?.cardToken === undefined
        ? {}
        : { cardToken: body.cardDetails.cardToken }),
    };
  }

  async chargeCardToken(input: {
    readonly cardToken: string;
    readonly transactionReference: string;
  }): Promise<TransactionVerification> {
    const response = await this.#request(
      "POST",
      "/api/v1/merchant/cards/charge",
      {
        body: {
          transactionReference: input.transactionReference,
          collectionChannel: "API_NOTIFICATION",
          card: { cardToken: input.cardToken },
        },
      },
    );
    const body = unwrap(
      response,
      z.object({
        amountPaid: z.union([z.number(), z.string()]),
        paymentMethod: z.string().optional(),
        paymentReference: requiredString,
        paymentStatus: requiredString,
        transactionReference: requiredString,
      }),
    );
    return {
      amountPaidMinor: providerAmountToMinor(body.amountPaid),
      currency: "NGN",
      outcome: mapPaymentStatus(body.paymentStatus),
      paymentReference: body.paymentReference,
      rawStatus: body.paymentStatus,
      transactionReference: body.transactionReference,
      ...(body.paymentMethod === undefined
        ? {}
        : { paymentMethod: body.paymentMethod }),
    };
  }

  async createMandate(input: {
    readonly amountMinor: bigint;
    readonly autoRenew: boolean;
    readonly customerAccountBankCode: string;
    readonly customerAccountNumber: string;
    readonly customerAddress: string;
    readonly customerEmailAddress: string;
    readonly customerName: string;
    readonly customerPhoneNumber: string;
    readonly endDate: string;
    readonly mandateDescription: string;
    readonly mandateReference: string;
    readonly startDate: string;
  }): Promise<MandateResult> {
    const response = await this.#request(
      "POST",
      "/api/v1/direct-debit/mandate/create",
      {
        body: {
          mandateReference: input.mandateReference,
          mandateDescription: input.mandateDescription,
          mandateAmount: input.amountMinor,
          startDate: input.startDate,
          endDate: input.endDate,
          autoRenew: input.autoRenew,
          customerName: input.customerName,
          customerEmailAddress: input.customerEmailAddress,
          customerPhoneNumber: input.customerPhoneNumber,
          customerAddress: input.customerAddress,
          customerAccountNumber: input.customerAccountNumber,
          customerAccountBankCode: input.customerAccountBankCode,
        },
      },
    );
    return this.#parseMandate(response, input.mandateReference);
  }

  async getMandateStatus(mandateReference: string): Promise<MandateResult> {
    const response = await this.#request(
      "GET",
      "/api/v1/direct-debit/mandate/",
      { query: { mandateReferences: mandateReference } },
    );
    return this.#parseMandate(response, mandateReference);
  }

  #parseMandate(response: unknown, fallbackReference: string): MandateResult {
    const body = unwrap(
      response,
      z.union([
        z.object({
          mandateCode: z.string().optional(),
          mandateReference: z.string().optional(),
          externalMandateReference: z.string().optional(),
          mandateStatus: requiredString,
          authorizationLink: z.url().nullable().optional(),
        }),
        z
          .array(
            z.object({
              mandateCode: z.string().optional(),
              mandateReference: z.string().optional(),
              externalMandateReference: z.string().optional(),
              mandateStatus: requiredString,
              authorizationLink: z.url().nullable().optional(),
            }),
          )
          .min(1)
          .transform((items) => items[0]),
      ]),
    );
    if (body === undefined) {
      throw new Error("Monnify mandate response is empty");
    }
    return {
      mandateReference:
        body.mandateReference ??
        body.externalMandateReference ??
        fallbackReference,
      rawStatus: body.mandateStatus,
      outcome: mapMandateStatus(body.mandateStatus),
      ...(body.mandateCode === undefined
        ? {}
        : { mandateCode: body.mandateCode }),
      ...(body.authorizationLink === undefined ||
      body.authorizationLink === null
        ? {}
        : { authorizationLink: body.authorizationLink }),
    };
  }

  async debitMandate(input: {
    readonly amountMinor: bigint;
    readonly mandateReference: string;
    readonly narration: string;
    readonly paymentReference: string;
  }): Promise<MandateDebitResult> {
    const response = await this.#request(
      "POST",
      "/api/v1/direct-debit/mandate/debit",
      { body: { ...input, amount: input.amountMinor, amountMinor: undefined } },
    );
    return this.#parseMandateDebit(response, input.paymentReference);
  }

  async getMandateDebitStatus(
    paymentReference: string,
  ): Promise<MandateDebitResult> {
    const response = await this.#request(
      "GET",
      "/api/v1/direct-debit/mandate/debit-status",
      { query: { paymentReference } },
    );
    return this.#parseMandateDebit(response, paymentReference);
  }

  #parseMandateDebit(
    response: unknown,
    fallbackReference: string,
  ): MandateDebitResult {
    const body = unwrap(
      response,
      z.object({
        paymentReference: z.string().optional(),
        paymentStatus: requiredString,
        transactionReference: z.string().optional(),
      }),
    );
    return {
      paymentReference: body.paymentReference ?? fallbackReference,
      rawStatus: body.paymentStatus,
      outcome: mapPaymentStatus(body.paymentStatus),
      ...(body.transactionReference === undefined
        ? {}
        : { transactionReference: body.transactionReference }),
    };
  }

  async getBanks(): Promise<readonly Bank[]> {
    const response = await this.#request("GET", "/api/v1/banks");
    return unwrap(
      response,
      z.array(
        z.object({
          code: requiredString,
          name: requiredString,
        }),
      ),
    );
  }

  async validateBankAccount(
    accountNumber: string,
    bankCode: string,
  ): Promise<AccountValidation> {
    const response = await this.#request(
      "GET",
      "/api/v1/disbursements/account/validate",
      { query: { accountNumber, bankCode } },
    );
    return unwrap(
      response,
      z.object({
        accountName: requiredString,
        accountNumber: requiredString,
        bankCode: requiredString,
      }),
    );
  }

  async initiateTransfer(input: {
    readonly amountMinor: bigint;
    readonly destinationAccountName: string;
    readonly destinationAccountNumber: string;
    readonly destinationBankCode: string;
    readonly narration: string;
    readonly reference: string;
  }): Promise<TransferResult> {
    if (this.config.sourceWalletAccountNumber === undefined) {
      throw new MonnifyError({
        code: "SOURCE_WALLET_NOT_CONFIGURED",
        kind: "invalid_request",
        message: "Monnify disbursement wallet is not configured.",
        retryable: false,
      });
    }
    const response = await this.#request(
      "POST",
      "/api/v2/disbursements/single",
      {
        body: {
          amount: input.amountMinor,
          reference: input.reference,
          narration: input.narration,
          destinationBankCode: input.destinationBankCode,
          destinationAccountNumber: input.destinationAccountNumber,
          destinationAccountName: input.destinationAccountName,
          currency: "NGN",
          sourceAccountNumber: this.config.sourceWalletAccountNumber,
          async: true,
        },
      },
    );
    return this.#parseTransfer(response, input.reference);
  }

  async getTransferStatus(reference: string): Promise<TransferResult> {
    const response = await this.#request(
      "GET",
      "/api/v2/disbursements/single/summary",
      { query: { reference } },
    );
    return this.#parseTransfer(response, reference);
  }

  #parseTransfer(response: unknown, fallbackReference: string): TransferResult {
    const body = unwrap(
      response,
      z.object({
        amount: z.union([z.number(), z.string()]),
        reference: z.string().optional(),
        status: requiredString,
        transactionReference: z.string().optional(),
      }),
    );
    return {
      amountMinor: providerAmountToMinor(body.amount),
      reference: body.reference ?? fallbackReference,
      rawStatus: body.status,
      outcome: mapTransferStatus(body.status),
      ...(body.transactionReference === undefined
        ? {}
        : { transactionReference: body.transactionReference }),
    };
  }

  async getWalletBalance(): Promise<WalletBalance> {
    if (this.config.sourceWalletAccountNumber === undefined) {
      throw new MonnifyError({
        code: "SOURCE_WALLET_NOT_CONFIGURED",
        kind: "invalid_request",
        message: "Monnify disbursement wallet is not configured.",
        retryable: false,
      });
    }
    const response = await this.#request(
      "GET",
      "/api/v2/disbursements/wallet-balance",
      { query: { accountNumber: this.config.sourceWalletAccountNumber } },
    );
    const body = unwrap(
      response,
      z.object({
        accountNumber: requiredString,
        availableBalance: z.union([z.number(), z.string()]),
        currency: requiredString,
        ledgerBalance: z.union([z.number(), z.string()]),
      }),
    );
    return {
      accountNumber: body.accountNumber,
      availableBalanceMinor: providerAmountToMinor(body.availableBalance),
      ledgerBalanceMinor: providerAmountToMinor(body.ledgerBalance),
      currency: body.currency,
    };
  }
}
