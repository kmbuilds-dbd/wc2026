/**
 * api-sports.io Football v3 — thin typed fetch wrapper.
 *
 * Auth: x-apisports-key header (the direct path, not via RapidAPI).
 * Base URL: https://v3.football.api-sports.io
 *
 * Free tier = 100 req/day. We pull only on cron + admin-triggered seeds.
 */
import { getCloudflareContext } from "@opennextjs/cloudflare";
import type {
  ApiSportsEnvelope,
  ApiSportsTeam,
  ApiSportsFixture,
  ApiSportsFixtureEvent,
  ApiSportsTopScorer,
  ApiSportsStandingsLeague,
} from "./types";

export class ApiSportsError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(message);
    this.name = "ApiSportsError";
  }
}

interface ClientConfig {
  baseUrl: string;
  key: string;
}

async function loadConfig(): Promise<ClientConfig> {
  const { env } = await getCloudflareContext({ async: true });
  const baseUrl = env.API_SPORTS_BASE_URL;
  const key = (env as unknown as { API_SPORTS_KEY?: string }).API_SPORTS_KEY;
  if (!key) {
    throw new ApiSportsError(
      "API_SPORTS_KEY not configured. Set via `wrangler secret put API_SPORTS_KEY`.",
      500,
      null,
    );
  }
  return { baseUrl, key };
}

async function call<T>(path: string, params: Record<string, string | number> = {}): Promise<T> {
  const { baseUrl, key } = await loadConfig();
  const url = new URL(baseUrl + path);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, String(v));
  }

  const res = await fetch(url, {
    headers: { "x-apisports-key": key, Accept: "application/json" },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new ApiSportsError(
      `api-sports ${res.status} on ${path}`,
      res.status,
      body.slice(0, 500),
    );
  }

  const body = (await res.json()) as ApiSportsEnvelope<T>;

  // api-sports returns 200 even on logical errors; check the envelope.
  const errs = body.errors;
  const hasErrors = Array.isArray(errs) ? errs.length > 0 : Object.keys(errs).length > 0;
  if (hasErrors) {
    throw new ApiSportsError(`api-sports logical error on ${path}`, 200, errs);
  }

  return body.response;
}

// ── Endpoints we use ─────────────────────────────────────────────────────

export function fetchTeams(leagueId: number, season: number): Promise<ApiSportsTeam[]> {
  return call("/teams", { league: leagueId, season });
}

export function fetchFixtures(leagueId: number, season: number): Promise<ApiSportsFixture[]> {
  return call("/fixtures", { league: leagueId, season });
}

export function fetchFinishedFixtures(
  leagueId: number,
  season: number,
): Promise<ApiSportsFixture[]> {
  // status param accepts comma-separated short codes
  return call("/fixtures", { league: leagueId, season, status: "FT-AET-PEN" });
}

export function fetchFixtureEvents(fixtureId: number): Promise<ApiSportsFixtureEvent[]> {
  return call("/fixtures/events", { fixture: fixtureId });
}

export function fetchTopScorers(leagueId: number, season: number): Promise<ApiSportsTopScorer[]> {
  return call("/players/topscorers", { league: leagueId, season });
}

export function fetchStandings(
  leagueId: number,
  season: number,
): Promise<ApiSportsStandingsLeague[]> {
  return call("/standings", { league: leagueId, season });
}
