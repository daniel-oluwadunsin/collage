export const openApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "Collage API",
    version: "0.3.0",
    description:
      "Telegram-native Collage public and internal API. Financial provider results remain pending until server verification.",
  },
  servers: [{ url: "/" }],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "CollageSession",
      },
      internalAuth: {
        type: "apiKey",
        in: "header",
        name: "x-collage-internal-signature",
      },
    },
  },
  paths: {
    "/health/live": { get: { summary: "Process liveness" } },
    "/health/ready": { get: { summary: "PostgreSQL and Redis readiness" } },
    "/v1/auth/telegram/bootstrap": {
      post: { summary: "Verify Telegram init data and bootstrap a session" },
    },
    "/v1/collages": {
      post: { summary: "Create a Collage", security: [{ bearerAuth: [] }] },
    },
    "/v1/collages/{collageId}": {
      get: { summary: "Read a Collage", security: [{ bearerAuth: [] }] },
      patch: {
        summary: "Update a draft Collage",
        security: [{ bearerAuth: [] }],
      },
    },
    "/v1/collages/{collageId}/open-registration": {
      post: { summary: "Open registration", security: [{ bearerAuth: [] }] },
    },
    "/v1/collages/{collageId}/status": {
      get: {
        summary: "Read operational status",
        security: [{ bearerAuth: [] }],
      },
    },
    "/v1/collages/{collageId}/rules": {
      get: {
        summary: "Read current immutable rules",
        security: [{ bearerAuth: [] }],
      },
    },
    "/v1/collages/{collageId}/positions": {
      get: { summary: "Read payout positions", security: [{ bearerAuth: [] }] },
    },
    "/v1/collages/{collageId}/history": {
      get: {
        summary: "Read cycle and payout history",
        security: [{ bearerAuth: [] }],
      },
    },
    "/v1/collages/{collageId}/reconcile": {
      post: { summary: "Queue reconciliation", security: [{ bearerAuth: [] }] },
    },
    "/v1/collages/{collageId}/me/registration": {
      get: { summary: "Resume registration", security: [{ bearerAuth: [] }] },
    },
    "/v1/collages/{collageId}/registrations/details": {
      post: {
        summary: "Submit encrypted registration details",
        security: [{ bearerAuth: [] }],
      },
    },
    "/v1/collages/{collageId}/registrations/phone/request-otp": {
      post: { summary: "Request phone OTP", security: [{ bearerAuth: [] }] },
    },
    "/v1/collages/{collageId}/registrations/phone/verify": {
      post: { summary: "Verify phone OTP", security: [{ bearerAuth: [] }] },
    },
    "/v1/collages/{collageId}/registrations/confirm-rules": {
      post: {
        summary: "Record rule and recurring-payment consent",
        security: [{ bearerAuth: [] }],
      },
    },
    "/v1/banks": {
      get: {
        summary: "List Monnify-supported banks",
        security: [{ bearerAuth: [] }],
      },
    },
    "/v1/bank-accounts/resolve": {
      post: {
        summary: "Resolve an account name",
        security: [{ bearerAuth: [] }],
      },
    },
    "/v1/collages/{collageId}/me/payout-account": {
      get: {
        summary: "Read masked payout account",
        security: [{ bearerAuth: [] }],
      },
      put: {
        summary: "Verify and replace payout account",
        security: [{ bearerAuth: [] }],
      },
    },
    "/v1/collages/{collageId}/me/payment-method": {
      get: {
        summary: "Read masked payment method",
        security: [{ bearerAuth: [] }],
      },
    },
    "/v1/collages/{collageId}/me/payment-methods/card/setup": {
      post: {
        summary: "Initialize card setup",
        security: [{ bearerAuth: [] }],
      },
    },
    "/v1/collages/{collageId}/me/payment-methods/direct-debit/setup": {
      post: {
        summary: "Create direct-debit mandate",
        security: [{ bearerAuth: [] }],
      },
    },
    "/v1/payment-authorizations/{authorizationId}": {
      get: {
        summary: "Read authorization state",
        security: [{ bearerAuth: [] }],
      },
    },
    "/v1/payment-authorizations/{authorizationId}/verify": {
      post: {
        summary: "Verify and activate provider credential",
        security: [{ bearerAuth: [] }],
      },
    },
    "/v1/collages/{collageId}/me/payment-methods/replace/card": {
      post: {
        summary: "Initialize safe card replacement",
        security: [{ bearerAuth: [] }],
      },
    },
    "/v1/collages/{collageId}/me/payment-methods/replace/direct-debit": {
      post: {
        summary: "Initialize safe mandate replacement",
        security: [{ bearerAuth: [] }],
      },
    },
    "/v1/collages/{collageId}/cycles/current/payments/manual": {
      post: {
        summary: "Initialize manual checkout",
        security: [{ bearerAuth: [] }],
      },
    },
    "/v1/payment-attempts/{attemptId}": {
      get: { summary: "Read payment attempt", security: [{ bearerAuth: [] }] },
    },
    "/v1/payment-attempts/{attemptId}/recheck": {
      post: {
        summary: "Queue server-side verification",
        security: [{ bearerAuth: [] }],
      },
    },
    "/v1/collages/{collageId}/payouts/{payoutId}": {
      get: {
        summary: "Read failed payout recovery state",
        security: [{ bearerAuth: [] }],
      },
    },
    "/v1/collages/{collageId}/payouts/{payoutId}/retry-account": {
      put: {
        summary: "Replace failed-payout destination",
        security: [{ bearerAuth: [] }],
      },
    },
    "/v1/collages/{collageId}/payouts/{payoutId}/retry": {
      post: {
        summary: "Queue eligible payout retry",
        security: [{ bearerAuth: [] }],
      },
    },
    "/internal/telegram/chats/upsert": {
      post: {
        summary: "Synchronize Telegram chat",
        security: [{ internalAuth: [] }],
      },
    },
    "/internal/telegram/chats/{telegramChatId}/status-card": {
      get: {
        summary: "Build bot status-card view model",
        security: [{ internalAuth: [] }],
      },
    },
    "/internal/telegram/events/member-joined": {
      post: {
        summary: "Synchronize member join",
        security: [{ internalAuth: [] }],
      },
    },
    "/internal/telegram/events/member-left": {
      post: {
        summary: "Synchronize member departure",
        security: [{ internalAuth: [] }],
      },
    },
    "/internal/telegram/events/bot-membership-changed": {
      post: {
        summary: "Synchronize bot membership",
        security: [{ internalAuth: [] }],
      },
    },
    "/internal/telegram/messages/pinned": {
      post: {
        summary: "Record pinned status message",
        security: [{ internalAuth: [] }],
      },
    },
    "/internal/telegram/actions/create-launch-token": {
      post: {
        summary: "Issue opaque Mini App launch token",
        security: [{ internalAuth: [] }],
      },
    },
    "/webhooks/monnify": {
      post: { summary: "Verified raw-body Monnify webhook ingress" },
    },
  },
} as const;
