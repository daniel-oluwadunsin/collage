import {
  verifyInternalRequest,
  type InternalAuthHeaders,
  type ReplayStore,
} from "@collage/security";
import type { NextFunction, Request, Response } from "express";

import { ApiError } from "./errors.js";

const requiredHeader = (request: Request, name: string): string | null => {
  const value = request.get(name);
  return value === undefined || value.length === 0 ? null : value;
};

export const createInternalAuthenticator =
  (secret: Buffer, replayStore: ReplayStore) =>
  async (
    request: Request,
    _response: Response,
    next: NextFunction,
  ): Promise<void> => {
    const service = requiredHeader(request, "x-collage-internal-service");
    const timestamp = requiredHeader(request, "x-collage-internal-timestamp");
    const nonce = requiredHeader(request, "x-collage-internal-nonce");
    const signature = requiredHeader(request, "x-collage-internal-signature");
    if (
      service === null ||
      timestamp === null ||
      nonce === null ||
      signature === null
    ) {
      throw new ApiError(
        401,
        "INTERNAL_AUTH_INVALID",
        "Internal request authentication failed.",
      );
    }
    const headers: InternalAuthHeaders = {
      "x-collage-internal-service": service,
      "x-collage-internal-timestamp": timestamp,
      "x-collage-internal-nonce": nonce,
      "x-collage-internal-signature": signature,
    };
    const valid = await verifyInternalRequest(
      {
        method: request.method,
        path: request.originalUrl,
        body: request.rawBody ?? Buffer.alloc(0),
      },
      headers,
      (candidate) => (candidate === "bot" ? secret : undefined),
      replayStore,
    );
    if (!valid) {
      throw new ApiError(
        401,
        "INTERNAL_AUTH_INVALID",
        "Internal request authentication failed.",
      );
    }
    next();
  };
