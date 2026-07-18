import type { Transformer } from "grammy";

export const createTelegramRateLimitTransformer = (options: {
  readonly maxRetries: number;
  readonly maxRetryAfterSeconds?: number;
  readonly wait?: (milliseconds: number) => Promise<void>;
}): Transformer => {
  const maximumDelay = options.maxRetryAfterSeconds ?? 5;
  const wait =
    options.wait ??
    ((milliseconds: number) =>
      new Promise<void>((resolve) => {
        setTimeout(resolve, milliseconds);
      }));

  return async (previous, method, payload, signal) => {
    for (let attempt = 0; ; attempt += 1) {
      const response = await previous(method, payload, signal);
      const retryAfter = response.ok
        ? undefined
        : response.parameters?.retry_after;
      if (
        retryAfter === undefined ||
        retryAfter > maximumDelay ||
        attempt >= options.maxRetries
      ) {
        return response;
      }
      await wait(retryAfter * 1_000);
    }
  };
};
