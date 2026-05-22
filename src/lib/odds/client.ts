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

/** Sport descriptor from /v4/sports. */
export interface OddsApiSport {
  key: string;
  group: string;
  title: string;
  description: string;
  active: boolean;
  has_outrights: boolean;
}

/**
 * List all sports + outright "sports" that The Odds API knows about.
 *
 * The Odds API surfaces tournament outrights (e.g. WC winner, Golden Boot,
 * group winners) as their own `sport` keys (e.g. `soccer_fifa_world_cup_winner`)
 * rather than as markets on the base sport. So we discover keys here, then
 * fetch each outright sport's odds individually.
 */
export function fetchAllSports(): Promise<OddsApiSport[]> {
  return call(`/sports`, { all: "true" });
}

/**
 * Fetch outright odds for a specific outright sport key (e.g.
 * `soccer_fifa_world_cup_winner`).
 *
 * For outright sports, the response shape is the same OddsApiEvent — each
 * "event" has one market (named after the outright) with a list of outcomes
 * (teams / players) and best prices per bookmaker.
 */
export function fetchOutrightsForSport(
  sportKey: string,
  regions = "eu,us,uk",
): Promise<OddsApiEvent[]> {
  return call(`/sports/${sportKey}/odds`, {
    regions,
    markets: "outrights",
    oddsFormat: "decimal",
  });
}
