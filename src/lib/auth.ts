import { currentUser } from "@clerk/nextjs/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { users, type User } from "@/db/schema";
import { isBlockedUserEmail } from "@/lib/blocked-users";

const APPROVED_ACCESS_PREFIX = "wc26:approved:";

interface EnsureUserOptions {
  displayName?: string;
  createdAt?: number;
}

export class UnauthenticatedError extends Error {
  constructor() {
    super("Not authenticated");
    this.name = "UnauthenticatedError";
  }
}

export async function getUserEmail(): Promise<string | null> {
  try {
    const clerkUser = await currentUser();
    return clerkUser?.emailAddresses[0]?.emailAddress?.toLowerCase() ?? null;
  } catch {
    return null;
  }
}

function resolveDisplayName(clerkUser: Awaited<ReturnType<typeof currentUser>>, email: string): string {
  const first = clerkUser?.firstName?.trim();
  const last = clerkUser?.lastName?.trim();
  if (first || last) return [first, last].filter(Boolean).join(" ");
  return email;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function fallbackDisplayName(email: string): string {
  return email.split("@")[0] || email;
}

export async function ensureUserRowForEmail(
  email: string,
  options: EnsureUserOptions = {},
): Promise<User> {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) throw new Error("Email is required");
  if (isBlockedUserEmail(normalizedEmail)) throw new UnauthenticatedError();

  const { env } = await getCloudflareContext({ async: true });
  const db = await getDb();
  const adminEmail = env.ADMIN_EMAIL?.toLowerCase();
  const isAdmin = adminEmail === normalizedEmail;
  const displayName = options.displayName?.trim() || fallbackDisplayName(normalizedEmail);

  const existing = await db.select().from(users).where(eq(users.email, normalizedEmail)).get();
  if (existing) {
    const updates: Partial<Pick<User, "displayName" | "isAdmin">> = {};
    if (options.displayName && existing.displayName !== displayName) updates.displayName = displayName;
    if (isAdmin && !existing.isAdmin) updates.isAdmin = true;

    if (Object.keys(updates).length > 0) {
      await db.update(users).set(updates).where(eq(users.email, normalizedEmail));
      return { ...existing, ...updates };
    }
    return existing;
  }

  const now = Math.floor(Date.now() / 1000);
  await db
    .insert(users)
    .values({
      email: normalizedEmail,
      displayName,
      avatarEmoji: null,
      isAdmin,
      createdAt: options.createdAt ?? now,
    })
    .onConflictDoNothing({ target: users.email });

  const ensured = await db.select().from(users).where(eq(users.email, normalizedEmail)).get();
  if (!ensured) throw new Error(`Could not create user row for ${normalizedEmail}`);
  return ensured;
}

async function canCreateUserRow(email: string): Promise<boolean> {
  const normalizedEmail = normalizeEmail(email);
  if (isBlockedUserEmail(normalizedEmail)) return false;
  const { env } = await getCloudflareContext({ async: true });
  if (env.ADMIN_EMAIL?.toLowerCase() === normalizedEmail) return true;
  return Boolean(await env.CACHE.get(`${APPROVED_ACCESS_PREFIX}${normalizedEmail}`));
}

export async function syncApprovedAccessUsers(): Promise<number> {
  const { env } = await getCloudflareContext({ async: true });
  const listed = await env.CACHE.list({ prefix: APPROVED_ACCESS_PREFIX });
  let synced = 0;

  for (const key of listed.keys) {
    const email = normalizeEmail(key.name.slice(APPROVED_ACCESS_PREFIX.length));
    if (!email.includes("@")) continue;
    if (isBlockedUserEmail(email)) continue;

    const approvedAt = await env.CACHE.get(key.name);
    const approvedAtMs = approvedAt ? Date.parse(approvedAt) : NaN;
    await ensureUserRowForEmail(email, {
      createdAt: Number.isFinite(approvedAtMs) ? Math.floor(approvedAtMs / 1000) : undefined,
    });
    synced += 1;
  }

  if (env.ADMIN_EMAIL) {
    await ensureUserRowForEmail(env.ADMIN_EMAIL, { displayName: fallbackDisplayName(env.ADMIN_EMAIL) });
    synced += 1;
  }

  return synced;
}

export async function requireUser(): Promise<User> {
  const clerkUser = await currentUser();
  const email = clerkUser?.emailAddresses[0]?.emailAddress?.toLowerCase();
  if (!email) throw new UnauthenticatedError();

  const displayName = resolveDisplayName(clerkUser, email);
  const db = await getDb();
  const existing = await db.select().from(users).where(eq(users.email, email)).get();
  if (!existing && !(await canCreateUserRow(email))) throw new UnauthenticatedError();

  return ensureUserRowForEmail(email, { displayName });
}

export async function requireAdmin(): Promise<User> {
  const email = await getUserEmail();
  if (!email) throw new UnauthenticatedError();

  const { env } = await getCloudflareContext({ async: true });
  const adminEmail = env.ADMIN_EMAIL?.toLowerCase();
  if (!adminEmail || email !== adminEmail) throw new UnauthenticatedError();

  return ensureUserRowForEmail(email, { displayName: fallbackDisplayName(email) });
}

export async function requirePrivileged(request: Request): Promise<"admin" | "cron"> {
  const cronSecret = request.headers.get("x-cron-secret");
  const { env } = await getCloudflareContext({ async: true });
  const expected = (env as unknown as { CRON_SECRET?: string }).CRON_SECRET;
  if (expected && cronSecret === expected) return "cron";

  await requireAdmin();
  return "admin";
}
