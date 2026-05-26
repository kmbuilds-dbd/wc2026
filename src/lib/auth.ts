/**
 * Cloudflare Access auth helper.
 *
 * In production, CF Access sits in front of the worker. After PIN auth, every
 * request to the origin includes:
 *   - cf-access-authenticated-user-email
 *   - cf-access-jwt-assertion (we trust the platform's header for now;
 *     verifying the JWT against the issuer's JWKS is a defense-in-depth
 *     upgrade we'll add post-launch)
 *
 * In local dev (next dev), CF Access is not in front, so we accept a
 * `x-dev-user-email` header or fall back to the ADMIN_EMAIL env var.
 */
import { headers } from "next/headers";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { users, type User } from "@/db/schema";

export class UnauthenticatedError extends Error {
  constructor() {
    super("Not authenticated");
    this.name = "UnauthenticatedError";
  }
}

/**
 * Read the authenticated user's email from request headers.
 *
 * Resolution order:
 *   1. CF Access header (the real production auth, once Zero Trust is set up)
 *   2. Dev-only `x-dev-user-email` (for impersonation during local testing)
 *   3. Open-admin fallback: ADMIN_EMAIL env var (anyone visiting is treated
 *      as admin). **This is open by default until CF Access is set up in
 *      front of the worker.** Acceptable for pre-launch testing; not for
 *      sharing the URL with the 50-user group.
 *
 * Returns null only if ADMIN_EMAIL is also unset.
 */
export async function getUserEmail(): Promise<string | null> {
  const h = await headers();
  const accessEmail = h.get("cf-access-authenticated-user-email");
  if (accessEmail) return accessEmail.toLowerCase();

  const devEmail = h.get("x-dev-user-email");
  if (devEmail) return devEmail.toLowerCase();

  // ADMIN_EMAIL fallback only applies in local dev (NEXTJS_ENV is set via
  // .dev.vars; it is absent from wrangler.jsonc so it's never set in prod).
  const { env } = await getCloudflareContext({ async: true });
  if (env.NEXTJS_ENV && env.ADMIN_EMAIL) return env.ADMIN_EMAIL.toLowerCase();

  return null;
}

/**
 * Get the current user record, lazy-creating it on first hit.
 * Throws UnauthenticatedError if no email header is present.
 */
export async function requireUser(): Promise<User> {
  const email = await getUserEmail();
  if (!email) throw new UnauthenticatedError();

  const db = await getDb();
  const existing = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .get();
  if (existing) return existing;

  const { env } = await getCloudflareContext({ async: true });
  const isAdmin = env.ADMIN_EMAIL?.toLowerCase() === email;

  const displayName = email.split("@")[0] ?? email;
  const now = Math.floor(Date.now() / 1000);

  const created = await db
    .insert(users)
    .values({
      email,
      displayName,
      avatarEmoji: null,
      isAdmin,
      createdAt: now,
    })
    .returning()
    .get();

  return created;
}

/**
 * Hard-gate: real CF Access header that matches the admin email. Open-admin
 * fallback DOES NOT apply here — `requireUser` allows it for page reads in
 * pre-launch testing, but admin mutations stay locked even before CF Access
 * is in front.
 *
 * Returns the admin user record. Throws UnauthenticatedError otherwise.
 */
export async function requireAdmin(): Promise<User> {
  const h = await headers();
  const accessEmail = h.get("cf-access-authenticated-user-email");
  const devEmail = h.get("x-dev-user-email");
  const explicitEmail = (accessEmail ?? devEmail)?.toLowerCase();
  if (!explicitEmail) throw new UnauthenticatedError();

  const { env } = await getCloudflareContext({ async: true });
  const adminEmail = env.ADMIN_EMAIL?.toLowerCase();
  if (!adminEmail || explicitEmail !== adminEmail) throw new UnauthenticatedError();

  const db = await getDb();
  const existing = await db
    .select()
    .from(users)
    .where(eq(users.email, explicitEmail))
    .get();
  if (existing) return existing;

  // Lazy-create the admin row if it doesn't exist yet (matches requireUser).
  const now = Math.floor(Date.now() / 1000);
  return db
    .insert(users)
    .values({
      email: explicitEmail,
      displayName: explicitEmail.split("@")[0] ?? explicitEmail,
      avatarEmoji: null,
      isAdmin: true,
      createdAt: now,
    })
    .returning()
    .get();
}

/**
 * Privileged-internal gate. Allows either:
 *   (a) the configured admin (via real CF Access email header), or
 *   (b) a request carrying `x-cron-secret: <CRON_SECRET>` (the same secret
 *       used to authenticate cron-trigger self-fetches).
 *
 * Use this for routes that should be callable BOTH by an interactive admin
 * AND by automated/CLI flows that pre-date CF Access being in front (e.g.
 * the initial /api/admin/seed run, or curl from a CI script). After CF
 * Access is in place, rotating CRON_SECRET removes the bypass.
 *
 * Open-admin fallback (no header, no secret) is REJECTED here — that mode
 * is for page reads only, not for mutations.
 */
export async function requirePrivileged(request: Request): Promise<"admin" | "cron"> {
  const cronSecret = request.headers.get("x-cron-secret");
  const { env } = await getCloudflareContext({ async: true });
  const expected = (env as unknown as { CRON_SECRET?: string }).CRON_SECRET;
  if (expected && cronSecret === expected) return "cron";

  await requireAdmin(); // throws UnauthenticatedError if no admin auth header
  return "admin";
}
