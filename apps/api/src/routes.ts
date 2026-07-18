import {
  Router,
  type NextFunction,
  type Request,
  type Response,
} from "express";

import { unauthorized } from "./errors.js";
import type { SessionService } from "./session.js";
import type { ApiData, RequestContext, WorkflowService } from "./workflow.js";

type AsyncHandler = (
  request: Request,
  response: Response,
  next: NextFunction,
) => Promise<void>;

const route =
  (handler: AsyncHandler) =>
  (request: Request, response: Response, next: NextFunction): void => {
    void handler(request, response, next).catch(next);
  };

const id = (request: Request, name: string): string => {
  const value = request.params[name];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Missing route parameter: ${name}`);
  }
  return value;
};

const context = (request: Request): RequestContext => {
  if (request.principal === undefined) {
    throw unauthorized();
  }
  return { principal: request.principal, requestId: request.requestId };
};

const success = (
  response: Response,
  requestId: string,
  data: ApiData,
  status = 200,
): void => {
  response.status(status).json({ success: true, data, requestId });
};

export const createPublicRouter = (
  workflow: WorkflowService,
  sessions: SessionService,
): Router => {
  const router = Router();

  router.post(
    "/auth/telegram/bootstrap",
    route(async (request, response) => {
      success(
        response,
        request.requestId,
        await workflow.bootstrap(request.body, request.requestId),
      );
    }),
  );

  router.use((request, _response, next) => {
    const authorization = request.get("authorization");
    if (!authorization?.startsWith("Bearer ")) {
      next(unauthorized());
      return;
    }
    try {
      request.principal = sessions.verify(authorization.slice(7));
      next();
    } catch (error) {
      next(error);
    }
  });

  router.post(
    "/collages",
    route(async (req, res) =>
      success(
        res,
        req.requestId,
        await workflow.createCollage(context(req), req.body),
        201,
      ),
    ),
  );
  router.get(
    "/collages/:collageId",
    route(async (req, res) =>
      success(
        res,
        req.requestId,
        await workflow.getCollage(context(req), id(req, "collageId")),
      ),
    ),
  );
  router.patch(
    "/collages/:collageId",
    route(async (req, res) =>
      success(
        res,
        req.requestId,
        await workflow.updateCollage(
          context(req),
          id(req, "collageId"),
          req.body,
        ),
      ),
    ),
  );
  router.post(
    "/collages/:collageId/open-registration",
    route(async (req, res) =>
      success(
        res,
        req.requestId,
        await workflow.openRegistration(context(req), id(req, "collageId")),
      ),
    ),
  );
  router.get(
    "/collages/:collageId/status",
    route(async (req, res) =>
      success(
        res,
        req.requestId,
        await workflow.getStatus(context(req), id(req, "collageId")),
      ),
    ),
  );
  router.get(
    "/collages/:collageId/rules",
    route(async (req, res) =>
      success(
        res,
        req.requestId,
        await workflow.getRules(context(req), id(req, "collageId")),
      ),
    ),
  );
  router.get(
    "/collages/:collageId/positions",
    route(async (req, res) =>
      success(
        res,
        req.requestId,
        await workflow.getPositions(context(req), id(req, "collageId")),
      ),
    ),
  );
  router.get(
    "/collages/:collageId/history",
    route(async (req, res) =>
      success(
        res,
        req.requestId,
        await workflow.getHistory(context(req), id(req, "collageId")),
      ),
    ),
  );
  router.post(
    "/collages/:collageId/reconcile",
    route(async (req, res) =>
      success(
        res,
        req.requestId,
        await workflow.requestReconciliation(
          context(req),
          id(req, "collageId"),
        ),
        202,
      ),
    ),
  );

  router.get(
    "/collages/:collageId/me/registration",
    route(async (req, res) =>
      success(
        res,
        req.requestId,
        await workflow.getRegistration(context(req), id(req, "collageId")),
      ),
    ),
  );
  router.post(
    "/collages/:collageId/registrations/details",
    route(async (req, res) =>
      success(
        res,
        req.requestId,
        await workflow.submitRegistrationDetails(
          context(req),
          id(req, "collageId"),
          req.body,
        ),
      ),
    ),
  );
  router.post(
    "/collages/:collageId/registrations/phone/request-otp",
    route(async (req, res) =>
      success(
        res,
        req.requestId,
        await workflow.requestOtp(context(req), id(req, "collageId"), req.body),
        202,
      ),
    ),
  );
  router.post(
    "/collages/:collageId/registrations/phone/verify",
    route(async (req, res) =>
      success(
        res,
        req.requestId,
        await workflow.verifyOtp(context(req), id(req, "collageId"), req.body),
      ),
    ),
  );
  router.post(
    "/collages/:collageId/registrations/confirm-rules",
    route(async (req, res) =>
      success(
        res,
        req.requestId,
        await workflow.confirmRules(
          context(req),
          id(req, "collageId"),
          req.body,
        ),
      ),
    ),
  );

  router.get(
    "/banks",
    route(async (req, res) =>
      success(res, req.requestId, await workflow.getBanks(context(req))),
    ),
  );
  router.post(
    "/bank-accounts/resolve",
    route(async (req, res) =>
      success(
        res,
        req.requestId,
        await workflow.resolveBankAccount(context(req), req.body),
      ),
    ),
  );
  router.get(
    "/collages/:collageId/me/payout-account",
    route(async (req, res) =>
      success(
        res,
        req.requestId,
        await workflow.getPayoutAccount(context(req), id(req, "collageId")),
      ),
    ),
  );
  router.put(
    "/collages/:collageId/me/payout-account",
    route(async (req, res) =>
      success(
        res,
        req.requestId,
        await workflow.updatePayoutAccount(
          context(req),
          id(req, "collageId"),
          req.body,
        ),
      ),
    ),
  );

  router.get(
    "/collages/:collageId/me/payment-method",
    route(async (req, res) =>
      success(
        res,
        req.requestId,
        await workflow.getPaymentMethod(context(req), id(req, "collageId")),
      ),
    ),
  );
  router.post(
    "/collages/:collageId/me/payment-methods/card/setup",
    route(async (req, res) =>
      success(
        res,
        req.requestId,
        await workflow.setupCard(context(req), id(req, "collageId"), req.body),
        202,
      ),
    ),
  );
  router.post(
    "/collages/:collageId/me/payment-methods/direct-debit/setup",
    route(async (req, res) =>
      success(
        res,
        req.requestId,
        await workflow.setupMandate(
          context(req),
          id(req, "collageId"),
          req.body,
        ),
        202,
      ),
    ),
  );
  router.get(
    "/payment-authorizations/:authorizationId",
    route(async (req, res) =>
      success(
        res,
        req.requestId,
        await workflow.getAuthorization(
          context(req),
          id(req, "authorizationId"),
        ),
      ),
    ),
  );
  router.post(
    "/payment-authorizations/:authorizationId/verify",
    route(async (req, res) =>
      success(
        res,
        req.requestId,
        await workflow.verifyAuthorization(
          context(req),
          id(req, "authorizationId"),
        ),
      ),
    ),
  );
  router.post(
    "/collages/:collageId/me/payment-methods/replace/card",
    route(async (req, res) =>
      success(
        res,
        req.requestId,
        await workflow.replacePaymentMethod(
          context(req),
          id(req, "collageId"),
          "card",
          req.body,
        ),
        202,
      ),
    ),
  );
  router.post(
    "/collages/:collageId/me/payment-methods/replace/direct-debit",
    route(async (req, res) =>
      success(
        res,
        req.requestId,
        await workflow.replacePaymentMethod(
          context(req),
          id(req, "collageId"),
          "direct-debit",
          req.body,
        ),
        202,
      ),
    ),
  );

  router.post(
    "/collages/:collageId/cycles/current/payments/manual",
    route(async (req, res) =>
      success(
        res,
        req.requestId,
        await workflow.initializeManualPayment(
          context(req),
          id(req, "collageId"),
          req.body,
        ),
        202,
      ),
    ),
  );
  router.get(
    "/payment-attempts/:attemptId",
    route(async (req, res) =>
      success(
        res,
        req.requestId,
        await workflow.getPaymentAttempt(context(req), id(req, "attemptId")),
      ),
    ),
  );
  router.post(
    "/payment-attempts/:attemptId/recheck",
    route(async (req, res) =>
      success(
        res,
        req.requestId,
        await workflow.recheckPaymentAttempt(
          context(req),
          id(req, "attemptId"),
        ),
        202,
      ),
    ),
  );

  router.get(
    "/collages/:collageId/payouts/:payoutId",
    route(async (req, res) =>
      success(
        res,
        req.requestId,
        await workflow.getPayout(
          context(req),
          id(req, "collageId"),
          id(req, "payoutId"),
        ),
      ),
    ),
  );
  router.put(
    "/collages/:collageId/payouts/:payoutId/retry-account",
    route(async (req, res) =>
      success(
        res,
        req.requestId,
        await workflow.updateRetryAccount(
          context(req),
          id(req, "collageId"),
          id(req, "payoutId"),
          req.body,
        ),
      ),
    ),
  );
  router.post(
    "/collages/:collageId/payouts/:payoutId/retry",
    route(async (req, res) =>
      success(
        res,
        req.requestId,
        await workflow.retryPayout(
          context(req),
          id(req, "collageId"),
          id(req, "payoutId"),
        ),
        202,
      ),
    ),
  );

  return router;
};

export const createInternalRouter = (
  workflow: WorkflowService,
  authenticate: AsyncHandler,
): Router => {
  const router = Router();
  router.use(route(authenticate));
  for (const [method, path, operation] of [
    ["post", "/chats/upsert", "chats.upsert"],
    ["get", "/chats/:telegramChatId/status-card", "chats.status-card"],
    ["post", "/events/member-joined", "events.member-joined"],
    ["post", "/events/member-left", "events.member-left"],
    ["post", "/events/bot-membership-changed", "events.bot-membership-changed"],
    ["post", "/messages/pinned", "messages.pinned"],
    ["post", "/actions/create-launch-token", "actions.create-launch-token"],
  ] as const) {
    router[method](
      path,
      route(async (request, response) => {
        success(
          response,
          request.requestId,
          await workflow.internalTelegram(
            operation,
            method === "get"
              ? { ...request.params, ...request.query }
              : request.body,
            request.requestId,
          ),
        );
      }),
    );
  }
  return router;
};
