import pino, { type Logger } from "pino";

const redactedPaths = [
  "req.headers.authorization",
  "req.body.nin",
  "req.body.phone",
  "req.body.accountNumber",
  "req.body.cardToken",
  "*.secretKey",
  "*.botToken",
];

export const createLogger = (service: string): Logger =>
  pino({
    base: { service },
    level: process.env.LOG_LEVEL ?? "info",
    redact: {
      paths: redactedPaths,
      censor: "[REDACTED]",
    },
  });
