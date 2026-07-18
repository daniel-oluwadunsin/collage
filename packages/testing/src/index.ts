export interface HealthFixture {
  readonly service: string;
  readonly status: "ok" | "ready";
}

export const healthFixture = (
  service: string,
  status: HealthFixture["status"] = "ok",
): HealthFixture => ({ service, status });
