import { getCloudflareContext } from "@opennextjs/cloudflare";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { users } from "@/db/schema";
import { isBlockedUserEmail } from "@/lib/blocked-users";
import { ensureUserRowForEmail } from "@/lib/auth";

export type AccessStatus = "approved" | "none";

export async function getAccessStatus(email: string): Promise<AccessStatus> {
  try {
    const { env } = await getCloudflareContext({ async: true });
    const normalizedEmail = email.trim().toLowerCase();
    if (isBlockedUserEmail(normalizedEmail)) return "none";
    if (env.ADMIN_EMAIL?.toLowerCase() === normalizedEmail) return "approved";

    const approved = await env.CACHE.get(`wc26:approved:${normalizedEmail}`);
    if (approved) return "approved";

    const db = await getDb();
    const registered = await db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .get();
    if (registered) return "approved";

    return "none";
  } catch {
    return "none";
  }
}

export async function approveAccess(email: string): Promise<void> {
  const { env } = await getCloudflareContext({ async: true });
  const normalizedEmail = email.trim().toLowerCase();
  if (isBlockedUserEmail(normalizedEmail)) return;
  await env.CACHE.put(`wc26:approved:${normalizedEmail}`, new Date().toISOString());
  await ensureUserRowForEmail(normalizedEmail);
}
