import { currentUser } from "@clerk/nextjs/server";
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

export async function requireUser(): Promise<User> {
  const clerkUser = await currentUser();
  const email = clerkUser?.emailAddresses[0]?.emailAddress?.toLowerCase();
  if (!email) throw new UnauthenticatedError();

  const displayName = resolveDisplayName(clerkUser, email);
  const db = await getDb();

  const existing = await db.select().from(users).where(eq(users.email, email)).get();
  if (existing) {
    // Keep display name in sync if Clerk profile has a better one.
    if (existing.displayName !== displayName) {
      await db.update(users).set({ displayName }).where(eq(users.email, email));
      return { ...existing, displayName };
    }
    return existing;
  }

  const { env } = await getCloudflareContext({ async: true });
  const isAdmin = env.ADMIN_EMAIL?.toLowerCase() === email;
  const now = Math.floor(Date.now() / 1000);

  return db
    .insert(users)
    .values({ email, displayName, avatarEmoji: null, isAdmin, createdAt: now })
    .returning()
    .get();
}

export async function requireAdmin(): Promise<User> {
  const email = await getUserEmail();
  if (!email) throw new UnauthenticatedError();

  const { env } = await getCloudflareContext({ async: true });
  const adminEmail = env.ADMIN_EMAIL?.toLowerCase();
  if (!adminEmail || email !== adminEmail) throw new UnauthenticatedError();

  const db = await getDb();
  const existing = await db.select().from(users).where(eq(users.email, email)).get();
  if (existing) return existing;

  const now = Math.floor(Date.now() / 1000);
  return db
    .insert(users)
    .values({
      email,
      displayName: email.split("@")[0] ?? email,
      avatarEmoji: null,
      isAdmin: true,
      createdAt: now,
    })
    .returning()
    .get();
}

export async function requirePrivileged(request: Request): Promise<"admin" | "cron"> {
  const cronSecret = request.headers.get("x-cron-secret");
  const { env } = await getCloudflareContext({ async: true });
  const expected = (env as unknown as { CRON_SECRET?: string }).CRON_SECRET;
  if (expected && cronSecret === expected) return "cron";

  await requireAdmin();
  return "admin";
}
