/**
 * Seed the `teams` table from api-sports.io, enriched with squad data from
 * the tracker snapshot (src/data/tracker-snapshot.json).
 *
 * Idempotent: re-running upserts, never duplicates. Uses api-sports team id
 * as the PK, which is also referenced by matches.{home,away}_team_id.
 *
 * Returns counts: { fetched, inserted, updated, unmatched }.
 */
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getDb } from "@/db/client";
import { teams } from "@/db/schema";
import { fetchTeams } from "@/lib/api-sports/client";
import { findTrackerTeam } from "./name-match";

export interface SeedTeamsResult {
  fetched: number;
  inserted: number;
  updated: number;
  unmatched: Array<{ id: number; name: string }>;
}

export async function seedTeams(): Promise<SeedTeamsResult> {
  const { env } = await getCloudflareContext({ async: true });
  const leagueId = Number(env.WC2026_LEAGUE_ID);
  const season = Number(env.WC2026_SEASON);

  const apiTeams = await fetchTeams(leagueId, season);
  const db = await getDb();

  const unmatched: Array<{ id: number; name: string }> = [];
  let inserted = 0;
  let updated = 0;

  for (const t of apiTeams) {
    const tracker = findTrackerTeam(t.team.name);
    if (!tracker) {
      unmatched.push({ id: t.team.id, name: t.team.name });
    }

    const row = {
      id: t.team.id,
      name: t.team.name,
      flag: tracker?.f ?? null,
      groupLetter: tracker?.g ?? "?", // ? marks teams we couldn't place; admin fixes via wrangler
      coach: tracker?.c ?? null,
      apiSportsData: tracker ?? null,
    };

    const result = await db
      .insert(teams)
      .values(row)
      .onConflictDoUpdate({
        target: teams.id,
        set: {
          name: row.name,
          flag: row.flag,
          groupLetter: row.groupLetter,
          coach: row.coach,
          apiSportsData: row.apiSportsData,
        },
      })
      .returning({ id: teams.id });

    // D1 doesn't return whether it was insert or update — count both as inserted on first run.
    if (result.length > 0) inserted++;
    else updated++;
  }

  return { fetched: apiTeams.length, inserted, updated, unmatched };
}
