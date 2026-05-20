import { drizzle } from "drizzle-orm/d1";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import * as schema from "./schema";

/**
 * Get a Drizzle client bound to the D1 database.
 *
 * Use the sync overload in dynamic server routes (route handlers, server actions);
 * use { async: true } in static / SSG contexts where the platform proxy is
 * initialized asynchronously by `next dev`.
 */
export async function getDb() {
  const { env } = await getCloudflareContext({ async: true });
  return drizzle(env.DB, { schema });
}

/**
 * Sync variant for places where we already have a Cloudflare execution context
 * (typical route handlers and server actions in dynamic routes).
 */
export function getDbSync() {
  const { env } = getCloudflareContext();
  return drizzle(env.DB, { schema });
}

export type Db = Awaited<ReturnType<typeof getDb>>;
