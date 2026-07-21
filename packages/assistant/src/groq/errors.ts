export class AssistantProviderError extends Error {
  constructor(
    readonly kind: "timeout" | "rate_limit" | "malformed" | "unavailable",
    options?: ErrorOptions,
  ) {
    super(`Assistant provider ${kind}`, options);
    this.name = "AssistantProviderError";
  }
}
