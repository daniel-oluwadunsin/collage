import type { HealthResponse } from "@collage/contracts";

export const dynamic = "force-dynamic";

export function GET(): Response {
  const body: HealthResponse = {
    service: "mini-app",
    status: "ready",
    timestamp: new Date().toISOString(),
  };

  return Response.json(body, { status: 200 });
}
