/**
 * Seed the `matches` table from api-sports.io fixtures for league=1
 * season=2026.
 *
 * Maps api-sports `league.round` strings to our stage enum.
 * Group-stage fixtures get group_letter from the home team's row in `teams`
 * (assumes teams seed has run first).
 *
 * Idempotent: upserts on fixture id. Does not modify `ingested_at` /
 * `raw_events` (those live with the ingestion pipeline, not the seed).
 */
import { eq, inArray } from "drizzle-orm";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getDb } from "@/db/client";
import { matches, teams, type Match } from "@/db/schema";
import { fetchFixtures } from "@/lib/api-sports/client";

type Stage = Match["stage"];

const STAGE_FROM_ROUND: Array<{ pattern: RegExp; stage: Stage }> = [
  { pattern: /^group stage/i, stage: "group" },
  { pattern: /round of 32/i, stage: "r32" },
  { pattern: /round of 16/i, stage: "r16" },
  { pattern: /quarter[- ]?finals?/i, stage: "qf" },
  { pattern: /semi[- ]?finals?/i, stage: "sf" },
  { pattern: /^final$/i, stage: "final" },
  { pattern: /(third|3rd) place/i, stage: "3p" },
];

function mapStage(round: string): Stage | null {
  for (const { pattern, stage } of STAGE_FROM_ROUND) {
    if (pattern.test(round)) return stage;
  }
  return null;
}

function mapStatus(short: string): Match["status"] {
  // api-sports short codes — see https://www.api-football.com/documentation-v3#tag/Fixtures
  if (["TBD", "NS", "PST", "CANC", "ABD", "AWD", "WO"].includes(short)) return "scheduled";
  if (["1H", "HT", "2H", "ET", "BT", "P", "SUSP", "INT", "LIVE"].includes(short)) return "live";
  if (["FT", "AET", "PEN"].includes(short)) return "finished";
  return "scheduled";
}

export interface SeedFixturesResult {
  fetched: number;
  upserted: number;
  unmappedRound: Array<{ id: number; round: string }>;
  unknownTeams: number;
}

export async function seedFixtures(): Promise<SeedFixturesResult> {
  const { env } = await getCloudflareContext({ async: true });
  const leagueId = Number(env.WC2026_LEAGUE_ID);
  const season = Number(env.WC2026_SEASON);

  const fixtures = await fetchFixtures(leagueId, season);
  const db = await getDb();

  // Preload teams for group-letter lookup (group stage only).
  const teamIds = Array.from(
    new Set(
      fixtures.flatMap((f) => [f.teams.home.id, f.teams.away.id]).filter((id): id is number => !!id),
    ),
  );
  const teamRows = teamIds.length
    ? await db.select().from(teams).where(inArray(teams.id, teamIds))
    : [];
  const teamById = new Map(teamRows.map((t) => [t.id, t]));

  const unmappedRound: Array<{ id: number; round: string }> = [];
  let unknownTeams = 0;
  let upserted = 0;

  for (const f of fixtures) {
    const stage = mapStage(f.league.round);
    if (!stage) {
      unmappedRound.push({ id: f.fixture.id, round: f.league.round });
      continue;
    }

    const home = teamById.get(f.teams.home.id);
    const away = teamById.get(f.teams.away.id);
    if (!home || !away) unknownTeams++;

    const groupLetter = stage === "group" ? home?.groupLetter ?? null : null;

    const row = {
      id: f.fixture.id,
      stage,
      groupLetter,
      homeTeamId: home?.id ?? null,
      awayTeamId: away?.id ?? null,
      kickoffUtc: f.fixture.timestamp,
      homeScore: f.goals.home,
      awayScore: f.goals.away,
      status: mapStatus(f.fixture.status.short),
    };

    await db
      .insert(matches)
      .values(row)
      .onConflictDoUpdate({
        target: matches.id,
        set: {
          stage: row.stage,
          groupLetter: row.groupLetter,
          homeTeamId: row.homeTeamId,
          awayTeamId: row.awayTeamId,
          kickoffUtc: row.kickoffUtc,
          homeScore: row.homeScore,
          awayScore: row.awayScore,
          status: row.status,
        },
      });

    upserted++;
  }

  return { fetched: fixtures.length, upserted, unmappedRound, unknownTeams };
}

/**
 * Returns the earliest match timestamp per stage, used by the lock policy.
 */
export async function getStageKickoffs(): Promise<Record<Stage, number | null>> {
  const db = await getDb();
  const stages: Stage[] = ["group", "r32", "r16", "qf", "sf", "final", "3p"];
  const out: Record<Stage, number | null> = {
    group: null, r32: null, r16: null, qf: null, sf: null, final: null, "3p": null,
  };
  for (const s of stages) {
    const r = await db
      .select({ k: matches.kickoffUtc })
      .from(matches)
      .where(eq(matches.stage, s))
      .orderBy(matches.kickoffUtc)
      .limit(1)
      .get();
    out[s] = r?.k ?? null;
  }
  return out;
}
