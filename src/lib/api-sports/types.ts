/**
 * api-sports.io Football v3 — minimal response types covering the endpoints
 * we actually consume. Anything we don't read is left as `unknown` to keep
 * the surface tight.
 *
 * Docs: https://www.api-football.com/documentation-v3
 */

export interface ApiSportsEnvelope<T> {
  get: string;
  parameters: Record<string, unknown>;
  errors: string[] | Record<string, string>; // can be either shape per docs
  results: number;
  paging: { current: number; total: number };
  response: T;
}

// ── /teams ───────────────────────────────────────────────────────────────
export interface ApiSportsTeam {
  team: {
    id: number;
    name: string;
    code: string | null;
    country: string | null;
    founded: number | null;
    national: boolean;
    logo: string | null;
  };
  venue: unknown;
}

// ── /fixtures ────────────────────────────────────────────────────────────
export interface ApiSportsFixture {
  fixture: {
    id: number;
    referee: string | null;
    timezone: string;
    date: string;          // ISO 8601 e.g. "2026-06-11T20:00:00+00:00"
    timestamp: number;     // unix seconds, UTC
    status: {
      long: string;
      short: string;       // 'NS' | 'FT' | 'AET' | 'PEN' | '1H' | '2H' | ...
      elapsed: number | null;
    };
    venue: unknown;
  };
  league: {
    id: number;
    name: string;
    country: string;
    season: number;
    round: string;        // 'Group Stage - 1' | 'Round of 32' | ...
  };
  teams: {
    home: { id: number; name: string; logo: string | null; winner: boolean | null };
    away: { id: number; name: string; logo: string | null; winner: boolean | null };
  };
  goals: {
    home: number | null;
    away: number | null;
  };
  score: {
    halftime: { home: number | null; away: number | null };
    fulltime: { home: number | null; away: number | null };
    extratime: { home: number | null; away: number | null };
    penalty: { home: number | null; away: number | null };
  };
}

// ── /fixtures/events ─────────────────────────────────────────────────────
export interface ApiSportsFixtureEvent {
  time: { elapsed: number; extra: number | null };
  team: { id: number; name: string; logo: string | null };
  player: { id: number | null; name: string | null };
  assist: { id: number | null; name: string | null };
  type: "Goal" | "Card" | "subst" | "Var";
  detail: string;        // 'Normal Goal' | 'Own Goal' | 'Penalty' | 'Yellow Card' | ...
  comments: string | null;
}

// ── /players/topscorers ──────────────────────────────────────────────────
export interface ApiSportsTopScorer {
  player: { id: number; name: string; firstname: string; lastname: string; photo: string | null };
  statistics: Array<{
    team: { id: number; name: string; logo: string | null };
    goals: { total: number | null; assists: number | null };
  }>;
}

// ── /standings ───────────────────────────────────────────────────────────
export interface ApiSportsStandingsLeague {
  league: {
    id: number;
    name: string;
    season: number;
    // groups in cup competitions: an array per group; each contains an
    // array of standings rows.
    standings: Array<Array<{
      rank: number;
      team: { id: number; name: string; logo: string | null };
      group: string;
      points: number;
      goalsDiff: number;
      all: { played: number; win: number; draw: number; lose: number;
             goals: { for: number; against: number } };
    }>>;
  };
}
