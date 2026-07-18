import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../generated/client/client.js";

export type { PrismaClient };
export { Prisma } from "../generated/client/client.js";
export * from "../generated/client/enums.js";

export const createPrismaClient = (databaseUrl: string): PrismaClient =>
  new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl }),
  });

export const checkDatabaseReadiness = async (
  client: PrismaClient,
): Promise<{ readonly detail: "ready"; readonly ready: true }> => {
  await client.$queryRaw`SELECT 1`;
  return { ready: true, detail: "ready" };
};
