import { getCloudflareContext } from "@opennextjs/cloudflare";

export type AccessStatus = "approved" | "none";

export async function getAccessStatus(email: string): Promise<AccessStatus> {
  const { env } = await getCloudflareContext({ async: true });

  if (env.ADMIN_EMAIL?.toLowerCase() === email.toLowerCase()) return "approved";

  try {
    const approved = await env.CACHE.get(`access:approved:${email}`);
    return approved ? "approved" : "none";
  } catch {
    return "none";
  }
}

export async function approveAccess(email: string): Promise<void> {
  const { env } = await getCloudflareContext({ async: true });
  await env.CACHE.put(`access:approved:${email}`, new Date().toISOString());
}
