import type {
  CheckoutInitialization,
  MandateDebitResult,
  MonnifyClient,
  TransactionVerification,
  TransferResult,
} from "@collage/monnify";

export interface WorkerProvider {
  chargeCardToken(
    input: Parameters<MonnifyClient["chargeCardToken"]>[0],
  ): Promise<TransactionVerification>;
  debitMandate(
    input: Parameters<MonnifyClient["debitMandate"]>[0],
  ): Promise<MandateDebitResult>;
  getMandateDebitStatus(paymentReference: string): Promise<MandateDebitResult>;
  getTransferStatus(reference: string): Promise<TransferResult>;
  initiateTransfer(
    input: Parameters<MonnifyClient["initiateTransfer"]>[0],
  ): Promise<TransferResult>;
  initializeCheckout(
    input: Parameters<MonnifyClient["initializeCheckout"]>[0],
  ): Promise<CheckoutInitialization>;
  verifyTransactionByPaymentReference(
    reference: string,
  ): Promise<TransactionVerification>;
}

export class DisabledWorkerProvider implements WorkerProvider {
  private unavailable(): Promise<never> {
    return Promise.reject(
      new Error("Provider calls are disabled for this worker"),
    );
  }

  chargeCardToken(
    _input: Parameters<MonnifyClient["chargeCardToken"]>[0],
  ): Promise<TransactionVerification> {
    return this.unavailable();
  }

  debitMandate(
    _input: Parameters<MonnifyClient["debitMandate"]>[0],
  ): Promise<MandateDebitResult> {
    return this.unavailable();
  }

  getMandateDebitStatus(
    _paymentReference: string,
  ): Promise<MandateDebitResult> {
    return this.unavailable();
  }

  getTransferStatus(_reference: string): Promise<TransferResult> {
    return this.unavailable();
  }

  initiateTransfer(
    _input: Parameters<MonnifyClient["initiateTransfer"]>[0],
  ): Promise<TransferResult> {
    return this.unavailable();
  }

  initializeCheckout(
    _input: Parameters<MonnifyClient["initializeCheckout"]>[0],
  ): Promise<CheckoutInitialization> {
    return this.unavailable();
  }

  verifyTransactionByPaymentReference(
    _reference: string,
  ): Promise<TransactionVerification> {
    return this.unavailable();
  }
}
