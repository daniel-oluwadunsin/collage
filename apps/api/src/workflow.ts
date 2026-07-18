import type { ApiPrincipal } from "./session.js";

export type ApiData =
  | boolean
  | null
  | number
  | string
  | readonly ApiData[]
  | { readonly [key: string]: ApiData };

export interface RequestContext {
  readonly principal: ApiPrincipal;
  readonly requestId: string;
}

export interface WorkflowService {
  bootstrap(input: unknown, requestId: string): Promise<ApiData>;
  createCollage(context: RequestContext, input: unknown): Promise<ApiData>;
  getCollage(context: RequestContext, collageId: string): Promise<ApiData>;
  updateCollage(
    context: RequestContext,
    collageId: string,
    input: unknown,
  ): Promise<ApiData>;
  openRegistration(
    context: RequestContext,
    collageId: string,
  ): Promise<ApiData>;
  getStatus(context: RequestContext, collageId: string): Promise<ApiData>;
  getRules(context: RequestContext, collageId: string): Promise<ApiData>;
  getPositions(context: RequestContext, collageId: string): Promise<ApiData>;
  getHistory(context: RequestContext, collageId: string): Promise<ApiData>;
  requestReconciliation(
    context: RequestContext,
    collageId: string,
  ): Promise<ApiData>;
  getRegistration(context: RequestContext, collageId: string): Promise<ApiData>;
  submitRegistrationDetails(
    context: RequestContext,
    collageId: string,
    input: unknown,
  ): Promise<ApiData>;
  requestOtp(
    context: RequestContext,
    collageId: string,
    input: unknown,
  ): Promise<ApiData>;
  verifyOtp(
    context: RequestContext,
    collageId: string,
    input: unknown,
  ): Promise<ApiData>;
  confirmRules(
    context: RequestContext,
    collageId: string,
    input: unknown,
  ): Promise<ApiData>;
  getBanks(context: RequestContext): Promise<ApiData>;
  resolveBankAccount(context: RequestContext, input: unknown): Promise<ApiData>;
  getPayoutAccount(
    context: RequestContext,
    collageId: string,
  ): Promise<ApiData>;
  updatePayoutAccount(
    context: RequestContext,
    collageId: string,
    input: unknown,
  ): Promise<ApiData>;
  setupCard(
    context: RequestContext,
    collageId: string,
    input: unknown,
  ): Promise<ApiData>;
  setupMandate(
    context: RequestContext,
    collageId: string,
    input: unknown,
  ): Promise<ApiData>;
  getAuthorization(
    context: RequestContext,
    authorizationId: string,
  ): Promise<ApiData>;
  verifyAuthorization(
    context: RequestContext,
    authorizationId: string,
  ): Promise<ApiData>;
  initializeManualPayment(
    context: RequestContext,
    collageId: string,
    input: unknown,
  ): Promise<ApiData>;
  getPaymentAttempt(
    context: RequestContext,
    attemptId: string,
  ): Promise<ApiData>;
  recheckPaymentAttempt(
    context: RequestContext,
    attemptId: string,
  ): Promise<ApiData>;
  getPaymentMethod(
    context: RequestContext,
    collageId: string,
  ): Promise<ApiData>;
  replacePaymentMethod(
    context: RequestContext,
    collageId: string,
    kind: "card" | "direct-debit",
    input: unknown,
  ): Promise<ApiData>;
  getPayout(
    context: RequestContext,
    collageId: string,
    payoutId: string,
  ): Promise<ApiData>;
  updateRetryAccount(
    context: RequestContext,
    collageId: string,
    payoutId: string,
    input: unknown,
  ): Promise<ApiData>;
  retryPayout(
    context: RequestContext,
    collageId: string,
    payoutId: string,
  ): Promise<ApiData>;
  internalTelegram(
    operation: string,
    input: unknown,
    requestId: string,
  ): Promise<ApiData>;
}

const unavailable = (): Promise<never> =>
  Promise.reject(new Error("Workflow service is not configured"));

export const unavailableWorkflowService: WorkflowService = {
  bootstrap: unavailable,
  createCollage: unavailable,
  getCollage: unavailable,
  updateCollage: unavailable,
  openRegistration: unavailable,
  getStatus: unavailable,
  getRules: unavailable,
  getPositions: unavailable,
  getHistory: unavailable,
  requestReconciliation: unavailable,
  getRegistration: unavailable,
  submitRegistrationDetails: unavailable,
  requestOtp: unavailable,
  verifyOtp: unavailable,
  confirmRules: unavailable,
  getBanks: unavailable,
  resolveBankAccount: unavailable,
  getPayoutAccount: unavailable,
  updatePayoutAccount: unavailable,
  setupCard: unavailable,
  setupMandate: unavailable,
  getAuthorization: unavailable,
  verifyAuthorization: unavailable,
  initializeManualPayment: unavailable,
  getPaymentAttempt: unavailable,
  recheckPaymentAttempt: unavailable,
  getPaymentMethod: unavailable,
  replacePaymentMethod: unavailable,
  getPayout: unavailable,
  updateRetryAccount: unavailable,
  retryPayout: unavailable,
  internalTelegram: unavailable,
};
