import type { ApiPrincipal } from "./session.js";

declare global {
  namespace Express {
    interface Request {
      principal?: ApiPrincipal;
      rawBody?: Buffer;
      requestId: string;
    }
  }
}

export {};
