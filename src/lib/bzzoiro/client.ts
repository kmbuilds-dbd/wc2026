/**
 * bzzoiro Sports Data API — minimal client.
 *
 * Auth: header `Authorization: Token {key}`
 * Base URL: https://sports.bzzoiro.com/api/
 *
 * Free tier docs claim no rate limits + no daily quota. We still cache where
 * possible and only call from cron + admin-triggered seeds.
 *
 * NOTE: this is the v1 scaffold — endpoints + types are filled in once the
 * /api/admin/bzzoiro-probe response confirms actual response shapes for
 * WC 2026 (their docs gave conflicting signals on coverage gating).
 */
import { getCloudflareContext } from "@opennextjs/cloudflare";

export class BzzoiroError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(message);
    this.name = "BzzoiroError";
  }
}

interface ClientConfig {
  baseUrl: string;
  token: string;
}

async function loadConfig(): Promise<ClientConfig> {
  const { env } = await getCloudflareContext({ async: true });
  const baseUrl =
    (env as unknown as { BZZOIRO_BASE_URL?: string }).BZZOIRO_BASE_URL ??
    "https://sports.bzzoiro.com/api";
  const token = (env as unknown as { BZZOIRO_TOKEN?: string }).BZZOIRO_TOKEN;
  if (!token) {
    throw new BzzoiroError(
      "BZZOIRO_TOKEN not configured. Set via `wrangler secret put BZZOIRO_TOKEN`.",
      500,
      null,
    );
  }
  return { baseUrl: baseUrl.replace(/\/$/, ""), token };
}

/**
 * Untyped GET helper. We type return values per-endpoint once we've seen
 * actual response shapes from the probe.
 */
export async function get<T = unknown>(
  path: string,
  params: Record<string, string | number> = {},
): Promise<T> {
  const { baseUrl, token } = await loadConfig();
  const url = new URL(baseUrl + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));

  const res = await fetch(url, {
    headers: {
      Authorization: `Token ${token}`,
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      body = (await res.text()).slice(0, 500);
    }
    throw new BzzoiroError(`bzzoiro ${res.status} on ${path}`, res.status, body);
  }

  return (await res.json()) as T;
}
