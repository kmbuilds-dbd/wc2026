/**
 * The Odds API v4 — thin typed fetch wrapper.
 *
 * Auth: ?apiKey={key} in query string.
 * Base URL: https://api.the-odds-api.com/v4
 *
 * Free tier = 500 req/month. Our cron pulls daily, single sport, ≤3 events
 * we care about, so we sit well under the cap.
 */
import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { OddsApiEvent } from "./types";

export const WC2026_SPORT_KEY = "soccer_fifa_world_cup";

export class OddsApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(message);
    this.name = "OddsApiError";
  }
}

interface ClientConfig {
  baseUrl: string;
  key: string;
}

async function loadConfig(): Promise<ClientConfig> {
  const { env } = await getCloudflareContext({ async: true });
  const baseUrl = env.ODDS_API_BASE_URL;
  const key = (env as unknown as { ODDS_API_KEY?: string }).ODDS_API_KEY;
  if (!key) {
    throw new OddsApiError(
      "ODDS_API_KEY not configured. Set via `wrangler secret put ODDS_API_KEY`.",
      500,
      null,
    );
  }
  return { baseUrl, key };
}

async function call<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const { baseUrl, key } = await loadConfig();
  const url = new URL(baseUrl + path);
  url.searchParams.set("apiKey", key);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url, { headers: { Accept: "application/json" } });

  if (!res.ok) {
    const body = await res.text();
    throw new OddsApiError(
      `the-odds-api ${res.status} on ${path}`,
      res.status,
      body.slice(0, 500),
    );
  }

  return (await res.json()) as T;
}

/**
 * Returns all outright/event markets for WC 2026.
 *
 * Markets we care about identify themselves via event title; the seed
 * function filters by `home_team` / `away_team` prefixes like
 *   "FIFA World Cup Winner"
 *   "FIFA World Cup Top Goalscorer"
 *   "FIFA World Cup Group A Winner"
 */
export function fetchWcOutrights(regions = "eu,us,uk"): Promise<OddsApiEvent[]> {
  return call(`/sports/${WC2026_SPORT_KEY}/odds`, {
    regions,
    markets: "outrights",
    oddsFormat: "decimal",
  });
}
