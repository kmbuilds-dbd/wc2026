/**
 * POST /api/admin/bzzoiro-probe
 *
 * Diagnostic-only. Hits three bzzoiro endpoints to verify WC 2026 coverage
 * BEFORE we rewrite the seed pipeline to use it. Returns raw responses so
 * we can read the actual data shape (their public docs gave conflicting
 * signals on whether WC 2026 is gated on the free tier).
 *
 * Auth: requirePrivileged — admin email OR x-cron-secret header.
 *
 * Will be deleted once the bzzoiro seed pipeline is wired and verified.
 */
import { NextResponse, type NextRequest } from "next/server";
import { requirePrivileged, UnauthenticatedError } from "@/lib/auth";
import { get as bzGet, BzzoiroError } from "@/lib/bzzoiro/client";

interface ProbeStep {
  step: string;
  url: string;
  ok: boolean;
  status?: number;
  error?: string;
  summary?: unknown;
  raw?: unknown;
}

export async function POST(request: NextRequest) {
  try {
    await requirePrivileged(request);
  } catch (e) {
    if (e instanceof UnauthenticatedError) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    throw e;
  }

  const steps: ProbeStep[] = [];

  // Step 1: enumerate ALL leagues across all pages, find any FIFA / World Cup entry.
  let leagueId: number | string | null = null;
  let allLeagues: unknown[] = [];
  try {
    allLeagues = await fetchAllLeagues();
    const wcCandidates = allLeagues.filter((r) => {
      const name = String((r as Record<string, unknown>)?.name ?? "").toLowerCase();
      return /world cup|fifa|mundial/.test(name);
    });
    steps.push({
      step: "leagues (all pages)",
      url: "/leagues/?page=1.. (paginated)",
      ok: true,
      summary: {
        total_leagues: allLeagues.length,
        all_league_names: allLeagues
          .map((r) => (r as Record<string, unknown>)?.name)
          .filter(Boolean),
        wc_candidate_count: wcCandidates.length,
        wc_candidates: wcCandidates.map((r) =>
          pickFields(r, ["id", "name", "country", "is_women", "current_season"]),
        ),
      },
    });
    leagueId = pickLikelyWorldCupLeague(wcCandidates);
  } catch (e) {
    pushError(steps, "leagues (all pages)", "/leagues/?page=1..", e);
  }

  // Step 2: list seasons for that league
  let seasonId: number | string | null = null;
  if (leagueId !== null) {
    try {
      const seasons = await bzGet<unknown>("/seasons/", { league: String(leagueId) });
      steps.push({
        step: `seasons?league=${leagueId}`,
        url: `/seasons/?league=${leagueId}`,
        ok: true,
        summary: summarizeList(seasons, ["id", "name", "year", "label", "start_date", "end_date"]),
        raw: truncateList(seasons, 10),
      });
      seasonId = pickLikely2026Season(seasons);
    } catch (e) {
      pushError(steps, `seasons?league=${leagueId}`, `/seasons/?league=${leagueId}`, e);
    }
  } else {
    steps.push({
      step: "seasons (skipped)",
      url: "",
      ok: false,
      error: "no league_id resolved from step 1",
    });
  }

  // Step 3: fetch ALL events for the resolved league + season — first probe
  // showed only 26 events total (WC has 104) and 2 of them are bracket-slot
  // placeholders. Need to see the full distribution to decide if bzzoiro is
  // viable, or if we bail to api-sports Pro / a manual-entry hybrid.
  if (leagueId !== null && seasonId !== null) {
    try {
      const all = await fetchAllEvents(String(leagueId), String(seasonId));
      steps.push({
        step: `events?league=${leagueId}&season=${seasonId} (all pages)`,
        url: `/events/?league=${leagueId}&season=${seasonId}&limit=200`,
        ok: true,
        summary: {
          total_events: all.length,
          by_round_number: groupBy(all, (e) => String(e?.round_number ?? "?")),
          by_round_name: groupBy(all, (e) => String(e?.round_name ?? "")),
          by_group_name: groupBy(all, (e) => String(e?.group_name ?? "(none)")),
          by_status: groupBy(all, (e) => String(e?.status ?? "?")),
          // Sample 5 events with team names so we can tell placeholders from reals.
          sample_team_names: all.slice(0, 5).map((e) => ({
            id: e?.id,
            round: e?.round_number,
            home: e?.home_team,
            away: e?.away_team,
            date: e?.event_date,
          })),
          distinct_team_names: Array.from(
            new Set(
              all.flatMap((e) => [String(e?.home_team ?? ""), String(e?.away_team ?? "")]),
            ),
          )
            .filter(Boolean)
            .sort(),
        },
      });
    } catch (e) {
      pushError(
        steps,
        "events (all pages)",
        `/events/?league=${leagueId}&season=${seasonId}&limit=200`,
        e,
      );
    }
  } else {
    steps.push({
      step: "events (skipped)",
      url: "",
      ok: false,
      error: "no league_id or season_id resolved",
    });
  }

  return NextResponse.json({
    ok: steps.every((s) => s.ok),
    resolved: { leagueId, seasonId },
    steps,
  });
}

// ─── helpers ────────────────────────────────────────────────────────────

/**
 * Walks bzzoiro's offset-style pagination for /events (uses ?limit/?offset
 * per their docs). Returns plain row objects.
 */
async function fetchAllEvents(
  leagueId: string,
  seasonId: string,
): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  const limit = 200;
  for (let offset = 0, safety = 0; safety < 20; safety++, offset += limit) {
    const body = await bzGet<unknown>("/events/", {
      league: leagueId,
      season: seasonId,
      limit,
      offset,
    });
    const rows = asArray(body) as Record<string, unknown>[];
    out.push(...rows);
    const next =
      body && typeof body === "object" && "next" in body
        ? (body as { next: unknown }).next
        : null;
    if (!next || !rows.length) break;
  }
  return out;
}

function groupBy<T>(arr: T[], keyFn: (t: T) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const item of arr) {
    const k = keyFn(item);
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

/** Walks bzzoiro's page-style pagination for /leagues until no `next` link. */
async function fetchAllLeagues(): Promise<unknown[]> {
  const out: unknown[] = [];
  let page = 1;
  for (let safety = 0; safety < 20; safety++, page++) {
    const body = await bzGet<unknown>("/leagues/", { page });
    const rows = asArray(body);
    out.push(...rows);
    // Bzzoiro uses { count, next, previous, results } envelopes per their docs.
    const next =
      body && typeof body === "object" && "next" in body
        ? (body as { next: unknown }).next
        : null;
    if (!next || !rows.length) break;
  }
  return out;
}


function pushError(steps: ProbeStep[], step: string, url: string, e: unknown) {
  if (e instanceof BzzoiroError) {
    steps.push({ step, url, ok: false, status: e.status, error: e.message, raw: e.body });
  } else {
    steps.push({
      step,
      url,
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object" && "results" in value) {
    const r = (value as { results: unknown }).results;
    if (Array.isArray(r)) return r;
  }
  return [];
}

function summarizeList(value: unknown, fields: string[]) {
  const arr = asArray(value);
  return {
    count: arr.length,
    sample: arr.slice(0, 5).map((row) => pickFields(row, fields)),
    all_keys: arr.length ? Object.keys(arr[0] as Record<string, unknown>).sort() : [],
  };
}

function truncateList(value: unknown, n: number) {
  const arr = asArray(value);
  return arr.slice(0, n);
}

function pickFields(row: unknown, fields: string[]): Record<string, unknown> {
  if (!row || typeof row !== "object") return { _raw: row };
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    if (f in row) out[f] = (row as Record<string, unknown>)[f];
  }
  return out;
}

function pickLikelyWorldCupLeague(value: unknown): number | string | null {
  const arr = asArray(value);
  // Prefer exact "FIFA World Cup" + country=World; fall back to any "World Cup".
  const exact = arr.find(
    (r) =>
      r &&
      typeof r === "object" &&
      String((r as Record<string, unknown>).name ?? "").toLowerCase() === "fifa world cup",
  );
  if (exact) return (exact as Record<string, unknown>).id as number | string;

  const fuzzy = arr.find(
    (r) =>
      r &&
      typeof r === "object" &&
      String((r as Record<string, unknown>).name ?? "")
        .toLowerCase()
        .includes("world cup") &&
      !String((r as Record<string, unknown>).name ?? "")
        .toLowerCase()
        .includes("qualif"),
  );
  return fuzzy ? ((fuzzy as Record<string, unknown>).id as number | string) : null;
}

function pickLikely2026Season(value: unknown): number | string | null {
  const arr = asArray(value);
  const match = arr.find((r) => {
    if (!r || typeof r !== "object") return false;
    const o = r as Record<string, unknown>;
    return [o.name, o.label, o.year, o.start_date].some(
      (f) => typeof f === "string" && f.includes("2026"),
    );
  });
  return match ? ((match as Record<string, unknown>).id as number | string) : null;
}
