import { randomUUID } from "node:crypto";

import type { HealthResponse } from "@collage/contracts";
import { Prisma } from "@collage/database";
import { createLogger } from "@collage/logger";
import { MonnifyError } from "@collage/monnify";
import cors from "cors";
import express, {
  type ErrorRequestHandler,
  type Express,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import swaggerUi from "swagger-ui-express";
import { ZodError } from "zod";

import { ApiError } from "./errors.js";
import { openApiDocument } from "./openapi.js";
import { createInternalRouter, createPublicRouter } from "./routes.js";
import { SessionService } from "./session.js";
import {
  unavailableWorkflowService,
  type WorkflowService,
} from "./workflow.js";

const health = (status: HealthResponse["status"]): HealthResponse => ({
  service: "api",
  status,
  timestamp: new Date().toISOString(),
});

export interface WebhookIngress {
  ingest(
    rawBody: Buffer,
    input: {
      readonly ip: string;
      readonly requestId: string;
      readonly signature?: string;
    },
  ): Promise<{ readonly duplicate: boolean }>;
}

export interface ApiAppOptions {
  readonly allowedOrigins?: readonly string[];
  readonly internalAuthenticate?: (
    request: Request,
    response: Response,
    next: NextFunction,
  ) => Promise<void>;
  readonly logger?: ReturnType<typeof createLogger>;
  readonly readiness?: () => Promise<boolean>;
  readonly sessionService?: SessionService;
  readonly webhookIngress?: WebhookIngress;
  readonly workflow?: WorkflowService;
}

const defaultSession = (): SessionService =>
  new SessionService(Buffer.alloc(32, 1));

const requestId = (
  request: Request,
  response: Response,
  next: NextFunction,
) => {
  const supplied = request.get("x-request-id");
  request.requestId =
    supplied !== undefined && /^[\w.-]{8,128}$/u.test(supplied)
      ? supplied
      : randomUUID();
  response.setHeader("x-request-id", request.requestId);
  next();
};

const httpParserError = (error: unknown): ApiError | null => {
  if (error instanceof SyntaxError) {
    return new ApiError(400, "INVALID_JSON", "Request body is not valid JSON.");
  }
  if (
    typeof error === "object" &&
    error !== null &&
    "type" in error &&
    error.type === "entity.too.large"
  ) {
    return new ApiError(413, "BODY_TOO_LARGE", "Request body is too large.");
  }
  return null;
};

const toApiError = (error: unknown): ApiError => {
  if (error instanceof ApiError) return error;
  const parserError = httpParserError(error);
  if (parserError !== null) return parserError;
  if (error instanceof ZodError) {
    return new ApiError(400, "VALIDATION_ERROR", "Request validation failed.", {
      issues: error.issues.map((issue) => ({
        path: issue.path.join("."),
        code: issue.code,
      })),
    });
  }
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  ) {
    return new ApiError(
      409,
      "RESOURCE_CONFLICT",
      "The requested resource already exists or changed concurrently.",
    );
  }
  if (error instanceof MonnifyError) {
    return new ApiError(
      error.failure.kind === "invalid_request" ? 422 : 503,
      error.failure.kind === "timeout"
        ? "PROVIDER_STATUS_UNKNOWN"
        : "PROVIDER_UNAVAILABLE",
      error.failure.kind === "timeout"
        ? "The provider outcome is unknown and will be reconciled."
        : "The provider could not complete the request.",
    );
  }
  return new ApiError(
    500,
    "INTERNAL_ERROR",
    "The request could not be completed.",
  );
};

export const createApiApp = (options: ApiAppOptions = {}): Express => {
  const app = express();
  const logger = options.logger ?? createLogger("api");
  const allowedOrigins = new Set(options.allowedOrigins ?? []);
  const workflow = options.workflow ?? unavailableWorkflowService;
  const sessions = options.sessionService ?? defaultSession();

  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(requestId);
  app.use(
    pinoHttp({
      logger,
      genReqId: (request: Request) => request.id,
      serializers: {
        req: (request: Request) => ({
          id: request.id,
          method: request.method,
          url: request.url,
        }),
        res: (response: Response) => ({ statusCode: response.statusCode }),
      },
    }),
  );
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: "same-site" },
    }),
  );
  app.use(
    cors({
      credentials: false,
      methods: ["GET", "POST", "PUT", "PATCH", "OPTIONS"],
      allowedHeaders: [
        "authorization",
        "content-type",
        "x-request-id",
        "x-collage-internal-service",
        "x-collage-internal-timestamp",
        "x-collage-internal-nonce",
        "x-collage-internal-signature",
      ],
      origin(origin, callback) {
        if (origin === undefined || allowedOrigins.has(origin)) {
          callback(null, true);
          return;
        }
        callback(
          new ApiError(403, "ORIGIN_FORBIDDEN", "Origin is not allowed."),
        );
      },
    }),
  );
  app.use(
    rateLimit({
      windowMs: 60_000,
      limit: 120,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      handler: (request, response) => {
        response.status(429).json({
          success: false,
          error: {
            code: "RATE_LIMITED",
            message: "Too many requests. Try again shortly.",
            details: {},
            requestId: request.requestId,
          },
        });
      },
    }),
  );

  app.post(
    "/webhooks/monnify",
    express.raw({ type: "application/json", limit: "256kb" }),
    (request, response, next) => {
      if (
        !Buffer.isBuffer(request.body) ||
        options.webhookIngress === undefined
      ) {
        next(
          new ApiError(
            503,
            "WEBHOOK_NOT_CONFIGURED",
            "Webhook ingress is unavailable.",
          ),
        );
        return;
      }
      const signature = request.get("monnify-signature");
      void options.webhookIngress
        .ingest(request.body, {
          ip: request.ip ?? "",
          requestId: request.requestId,
          ...(signature === undefined ? {} : { signature }),
        })
        .then((result) => {
          response
            .status(200)
            .json({ received: true, duplicate: result.duplicate });
        })
        .catch(next);
    },
  );

  app.use(
    express.json({
      limit: "64kb",
      strict: true,
      verify(request, _response, buffer) {
        (request as Request).rawBody = Buffer.from(buffer);
      },
    }),
  );

  app.get("/health/live", (_request, response) => {
    response.status(200).json(health("ok"));
  });
  app.get("/health/ready", (_request, response, next) => {
    void (options.readiness?.() ?? Promise.resolve(true))
      .then((ready) => {
        response.status(ready ? 200 : 503).json(
          ready
            ? health("ready")
            : {
                service: "api",
                status: "not-ready",
                timestamp: new Date().toISOString(),
              },
        );
      })
      .catch(next);
  });
  app.get("/openapi.json", (_request, response) => {
    response.status(200).json(openApiDocument);
  });
  app.use("/docs", swaggerUi.serve, swaggerUi.setup(openApiDocument));
  app.use("/v1", createPublicRouter(workflow, sessions));
  app.use(
    "/internal/telegram",
    createInternalRouter(
      workflow,
      options.internalAuthenticate ??
        ((_request, _response, _next) =>
          Promise.reject(
            new ApiError(
              401,
              "INTERNAL_AUTH_REQUIRED",
              "Internal authentication is required.",
            ),
          )),
    ),
  );

  app.use((_request, _response, next) => {
    next(
      new ApiError(404, "NOT_FOUND", "The requested resource was not found."),
    );
  });

  const errorHandler: ErrorRequestHandler = (
    error,
    request,
    response,
    _next,
  ) => {
    const apiError = toApiError(error);
    if (apiError.status >= 500) {
      request.log.error(
        { error, requestId: request.requestId },
        "API request failed",
      );
    }
    response.status(apiError.status).json({
      success: false,
      error: {
        code: apiError.code,
        message: apiError.message,
        details: apiError.details,
        requestId: request.requestId,
      },
    });
  };
  app.use(errorHandler);

  return app;
};
