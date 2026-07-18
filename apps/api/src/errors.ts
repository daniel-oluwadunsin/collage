export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: Readonly<Record<string, unknown>> = {},
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const unauthorized = (): ApiError =>
  new ApiError(
    401,
    "UNAUTHORIZED",
    "A valid Telegram Mini App session is required.",
  );

export const forbidden = (): ApiError =>
  new ApiError(
    403,
    "FORBIDDEN",
    "You are not authorized for this Collage action.",
  );
