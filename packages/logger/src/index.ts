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
  "req.body.email",
  "req.body.customerEmail",
  "req.body.address",
  "req.body.accountNumber",
  "req.body.cardToken",
  "req.body.botToken",
  "req.body.initData",
  "req.body.launchToken",
  "req.body.password",
  "req.body.accessToken",
  "req.body.refreshToken",
  "res.headers['set-cookie']",
  "*.nin",
  "*.phone",
  "*.email",
  "*.customerEmail",
  "*.address",
  "*.accountNumber",
  "*.cardToken",
  "*.credentialEncrypted",
  "*.providerPayloadEncrypted",
  "*.payloadEncrypted",
  "*.secret",
  "*.secretKey",
  "*.password",
  "*.accessToken",
  "*.refreshToken",
  "*.botToken",
  "*.initData",
  "*.launchToken",
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
