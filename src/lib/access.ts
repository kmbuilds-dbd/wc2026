import { getCloudflareContext } from "@opennextjs/cloudflare";

export type AccessStatus = "approved" | "pending" | "none";

export async function getAccessStatus(email: string): Promise<AccessStatus> {
  const { env } = await getCloudflareContext({ async: true });

  // Admin is always approved regardless of KV state.
  if (env.ADMIN_EMAIL?.toLowerCase() === email.toLowerCase()) return "approved";

  try {
    const approved = await env.CACHE.get(`access:approved:${email}`);
    if (approved) return "approved";

    const pending = await env.CACHE.get(`access:pending:${email}`);
    if (pending) return "pending";
  } catch {
    // KV unavailable (e.g. `npm run dev` without CF runtime) — deny access.
    return "none";
  }

  return "none";
}

export async function requestAccess(email: string): Promise<void> {
  const { env } = await getCloudflareContext({ async: true });
  await env.CACHE.put(`access:pending:${email}`, new Date().toISOString());
}

export async function approveAccess(email: string): Promise<void> {
  const { env } = await getCloudflareContext({ async: true });
  await env.CACHE.put(`access:approved:${email}`, new Date().toISOString());
  await env.CACHE.delete(`access:pending:${email}`);
}
