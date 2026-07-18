const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

export const isSerializationConflict = (error: unknown): boolean => {
  if (!isObject(error)) {
    return false;
  }
  if (
    error.code === "P2034" ||
    error.code === "40001" ||
    error.code === "40P01"
  ) {
    return true;
  }
  return "cause" in error && isSerializationConflict(error.cause);
};

export interface SerializationRetryOptions {
  readonly attempts?: number;
  readonly baseDelayMilliseconds?: number;
  readonly sleep?: (milliseconds: number) => Promise<void>;
}

const defaultSleep = async (milliseconds: number): Promise<void> => {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, milliseconds);
  });
};

export const withSerializationRetry = async <Result>(
  operation: () => Promise<Result>,
  options: SerializationRetryOptions = {},
): Promise<Result> => {
  const attempts = options.attempts ?? 3;
  const baseDelayMilliseconds = options.baseDelayMilliseconds ?? 10;
  const sleep = options.sleep ?? defaultSleep;
  if (attempts < 1 || attempts > 5) {
    throw new Error("Serialization retries must be between 1 and 5");
  }
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (!isSerializationConflict(error) || attempt === attempts) {
        throw error;
      }
      await sleep(baseDelayMilliseconds * 2 ** (attempt - 1));
    }
  }
  throw new Error("Unreachable serialization retry state");
};
