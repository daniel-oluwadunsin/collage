import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Prisma generation does not connect to PostgreSQL. Commands that do
    // connect still receive DATABASE_URL from the invoking environment.
    url:
      process.env.DATABASE_URL ??
      "postgresql://collage:collage_local_only@localhost:5432/collage",
  },
});
