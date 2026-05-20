import type { Config } from "drizzle-kit";

/**
 * Drizzle Kit config — used to generate SQL migrations from the schema.
 *
 * Workflow:
 *   npm run db:gen          → emits SQL migration files under src/db/migrations/
 *   wrangler d1 migrations apply wc2026 --local   → applies to local D1
 *   wrangler d1 migrations apply wc2026 --remote  → applies to production D1
 */
export default {
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
  dialect: "sqlite",
  // We use wrangler to apply migrations to D1 (it understands the binding),
  // so drizzle-kit only needs to generate SQL.
} satisfies Config;
