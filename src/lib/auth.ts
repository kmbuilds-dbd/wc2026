import { headers, cookies } from "next/headers";
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
 * Resolution order:
 *   1. CF Access header (set when Zero Trust is fully enforcing)
 *   2. Dev-only x-dev-user-email header
 *   3. wc_email session cookie (primary path — set by /api/access/join after invite code)
 *   4. ADMIN_EMAIL fallback in local dev only (NEXTJS_ENV present in .dev.vars)
 */
export async function getUserEmail(): Promise<string | null> {
  try {
    const h = await headers();
    const accessEmail = h.get("cf-access-authenticated-user-email");
    if (accessEmail) return accessEmail.toLowerCase();

    const devEmail = h.get("x-dev-user-email");
    if (devEmail) return devEmail.toLowerCase();

    const jar = await cookies();
    const sessionEmail = jar.get("wc_email")?.value;
    if (sessionEmail) return decodeURIComponent(sessionEmail).toLowerCase();

    const { env } = await getCloudflareContext({ async: true });
    if (env.NEXTJS_ENV && env.ADMIN_EMAIL) return env.ADMIN_EMAIL.toLowerCase();

    return null;
  } catch {
    return null;
  }
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
 * Admin gate. Accepts the admin email from:
 *   1. CF Access header (if Zero Trust is enforcing)
 *   2. x-dev-user-email header (local dev)
 *   3. wc_email session cookie (post-invite-join flow)
 */
export async function requireAdmin(): Promise<User> {
  const h = await headers();
  const accessEmail = h.get("cf-access-authenticated-user-email");
  const devEmail = h.get("x-dev-user-email");

  const jar = await cookies();
  const cookieEmail = jar.get("wc_email")?.value
    ? decodeURIComponent(jar.get("wc_email")!.value).toLowerCase()
    : null;

  const explicitEmail = (accessEmail ?? devEmail)?.toLowerCase() ?? cookieEmail;
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
 * Privileged-internal gate (admin or cron secret).
 */
export async function requirePrivileged(request: Request): Promise<"admin" | "cron"> {
  const cronSecret = request.headers.get("x-cron-secret");
  const { env } = await getCloudflareContext({ async: true });
  const expected = (env as unknown as { CRON_SECRET?: string }).CRON_SECRET;
  if (expected && cronSecret === expected) return "cron";

  await requireAdmin();
  return "admin";
}
