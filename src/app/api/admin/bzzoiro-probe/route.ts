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

  // Step 1: find the FIFA World Cup league
  let leagueId: number | string | null = null;
  try {
    const leagues = await bzGet<unknown>("/leagues/", { search: "World Cup" });
    steps.push({
      step: "leagues?search=World Cup",
      url: "/leagues/?search=World%20Cup",
      ok: true,
      summary: summarizeList(leagues, ["id", "name", "country", "country_code"]),
      raw: truncateList(leagues, 5),
    });
    leagueId = pickLikelyWorldCupLeague(leagues);
  } catch (e) {
    pushError(steps, "leagues?search=World Cup", "/leagues/?search=World%20Cup", e);
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

  // Step 3: fetch a small slice of events for the resolved league + season
  if (leagueId !== null && seasonId !== null) {
    try {
      const events = await bzGet<unknown>("/events/", {
        league: String(leagueId),
        season: String(seasonId),
        limit: 2,
      });
      steps.push({
        step: `events?league=${leagueId}&season=${seasonId}&limit=2`,
        url: `/events/?league=${leagueId}&season=${seasonId}&limit=2`,
        ok: true,
        summary: summarizeList(events, [
          "id",
          "home_team",
          "away_team",
          "home_score",
          "away_score",
          "event_date",
          "status",
        ]),
        raw: events, // first 2 full events — gives us full field set for typing
      });
    } catch (e) {
      pushError(
        steps,
        "events",
        `/events/?league=${leagueId}&season=${seasonId}&limit=2`,
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
