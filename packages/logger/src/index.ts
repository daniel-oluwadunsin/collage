import pino, {
  type DestinationStream,
  type LevelWithSilent,
  type Logger,
} from "pino";

export const redactedPaths = [
  "req.headers.authorization",
  "req.headers.cookie",
  "req.headers['x-collage-internal-signature']",
  "req.body.nin",
  "req.body.phone",
  "req.body.accountNumber",
  "req.body.cardToken",
  "req.body.botToken",
  "req.body.initData",
  "res.headers['set-cookie']",
  "*.nin",
  "*.phone",
  "*.accountNumber",
  "*.cardToken",
  "*.credentialEncrypted",
  "*.providerPayloadEncrypted",
  "*.payloadEncrypted",
  "*.secret",
  "*.secretKey",
  "*.botToken",
  "*.token",
] as const;

export interface LoggerOptions {
  readonly destination?: DestinationStream;
  readonly level?: LevelWithSilent;
}

export const createLogger = (
  service: string,
  options: LoggerOptions = {},
): Logger =>
  pino(
    {
      base: { service },
      level: options.level ?? process.env.LOG_LEVEL ?? "info",
      redact: {
        paths: [...redactedPaths],
        censor: "[REDACTED]",
      },
    },
    options.destination,
  );
