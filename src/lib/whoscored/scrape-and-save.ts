/**
 * Shared "scrape one WhoScored match and persist to D1" pipeline.
 *
 * Used by both:
 *   - POST /api/admin/scrape-and-save (one-shot, admin)
 *   - POST /api/cron/ingest-matches    (sweeps eligible rows on a schedule)
 *
 * Returns a per-event resolution report so unmatched players surface.
 * Writes to D1 only when the scraped status is "finished" — live/scheduled
 * scrapes are no-ops (we don't surface partial scores in the leaderboard).
 */
import { and, eq, isNotNull, lt, ne } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { matches, type Match } from "@/db/schema";
import * as schema from "@/db/schema";
import { scrapeMatch, type ScrapedMatch } from "./scrape";
import { resolveTeamId, resolvePlayerId } from "./name-match";
import type { MatchEvent } from "@/lib/scoring/compute";

type Db = DrizzleD1Database<typeof schema>;

export interface SaveReport {
  matchId: number;
  homeTeamId: number;
  awayTeamId: number;
  homeScore: number | null;
  awayScore: number | null;
  status: "scheduled" | "live" | "finished";
  events: Array<{
    type: "goal" | "own_goal" | "assist";
    minute: number;
    playerName: string;
    wsPlayerId: string;
    playerId: number | null;
    teamId: number;
  }>;
  unresolvedPlayers: Array<{ name: string; wsPlayerId: string; teamId: number }>;
  written: boolean;
  /** Set when the pipeline failed for this row. */
  error?: string;
}

function buildEvents(scraped: ScrapedMatch, homeTeamId: number, awayTeamId: number) {
  const events: SaveReport["events"] = [];
  const unresolved: SaveReport["unresolvedPlayers"] = [];

  for (const goal of scraped.goals) {
    const benefitTeamId = goal.side === "home" ? homeTeamId : awayTeamId;
    // OG scorer plays for the OPPOSING team relative to the side that benefited.
    const scorerTeamId = goal.ownGoal
      ? goal.side === "home" ? awayTeamId : homeTeamId
      : benefitTeamId;

    const scorerPlayer = resolvePlayerId(goal.scorer.name, scorerTeamId);
    if (!scorerPlayer) {
      unresolved.push({
        name: goal.scorer.name,
        wsPlayerId: goal.scorer.wsPlayerId,
        teamId: scorerTeamId,
      });
    }
    events.push({
      type: goal.ownGoal ? "own_goal" : "goal",
      minute: goal.minute,
      playerName: goal.scorer.name,
      wsPlayerId: goal.scorer.wsPlayerId,
      playerId: scorerPlayer?.id ?? null,
      teamId: scorerTeamId,
    });

    if (goal.ownGoal) continue;
    for (const assister of goal.assisters) {
      const assisterPlayer = resolvePlayerId(assister.name, benefitTeamId);
      if (!assisterPlayer) {
        unresolved.push({
          name: assister.name,
          wsPlayerId: assister.wsPlayerId,
          teamId: benefitTeamId,
        });
      }
      events.push({
        type: "assist",
        minute: goal.minute,
        playerName: assister.name,
        wsPlayerId: assister.wsPlayerId,
        playerId: assisterPlayer?.id ?? null,
        teamId: benefitTeamId,
      });
    }
  }
  return { events, unresolved };
}

/**
 * Scrape a single D1 matches row and persist the result. Row must already
 * exist and have whoscored_match_id set.
 */
export async function scrapeAndSaveRow(
  row: Match,
  db: Db,
): Promise<SaveReport> {
  if (!row.whoscoredMatchId) {
    return {
      matchId: row.id,
      homeTeamId: row.homeTeamId ?? 0,
      awayTeamId: row.awayTeamId ?? 0,
      homeScore: row.homeScore,
      awayScore: row.awayScore,
      status: row.status,
      events: [],
      unresolvedPlayers: [],
      written: false,
      error: "no whoscored_match_id mapped",
    };
  }

  const url = `https://www.whoscored.com/matches/${row.whoscoredMatchId}/show/whoscored-2026`;
  const scraped = await scrapeMatch(url);

  // Trust the D1 row's team_ids — they were set by import-fixtures and
  // are the authoritative mapping. Only verify against scrape if needed.
  const homeTeamId = row.homeTeamId;
  const awayTeamId = row.awayTeamId;
  if (homeTeamId == null || awayTeamId == null) {
    // Fallback: try to resolve from scraped names.
    const home = resolveTeamId(scraped.homeTeam);
    const away = resolveTeamId(scraped.awayTeam);
    if (!home || !away) {
      return {
        matchId: row.id,
        homeTeamId: homeTeamId ?? 0,
        awayTeamId: awayTeamId ?? 0,
        homeScore: row.homeScore,
        awayScore: row.awayScore,
        status: row.status,
        events: [],
        unresolvedPlayers: [],
        written: false,
        error: `unresolved teams: ${scraped.homeTeam} / ${scraped.awayTeam}`,
      };
    }
  }

  const { events, unresolved } = buildEvents(
    scraped,
    homeTeamId ?? resolveTeamId(scraped.homeTeam)!.id,
    awayTeamId ?? resolveTeamId(scraped.awayTeam)!.id,
  );

  let written = false;
  if (scraped.status === "finished") {
    const rawEvents: MatchEvent[] = events
      .filter((e) => e.playerId != null)
      .map((e) => ({
        type: e.type,
        playerId: e.playerId!,
        teamId: e.teamId,
        minute: e.minute,
      }));

    await db
      .update(matches)
      .set({
        homeScore: scraped.homeScore,
        awayScore: scraped.awayScore,
        status: "finished",
        rawEvents,
        ingestedAt: Math.floor(Date.now() / 1000),
      })
      .where(eq(matches.id, row.id));
    written = true;
  }

  return {
    matchId: row.id,
    homeTeamId: homeTeamId ?? 0,
    awayTeamId: awayTeamId ?? 0,
    homeScore: scraped.homeScore,
    awayScore: scraped.awayScore,
    status: scraped.status,
    events,
    unresolvedPlayers: unresolved,
    written,
  };
}

/**
 * Find matches that should be scraped: kickoff >= EARLIEST_AGO ago, not yet
 * finished, has a WhoScored ID. Used by the cron sweeper.
 *
 * Two-hour lower bound on kickoff avoids hammering Firecrawl with in-progress
 * games (which we don't surface partial state for anyway).
 */
export async function findEligibleMatches(db: Db, ageMinSeconds = 2 * 3600): Promise<Match[]> {
  const cutoff = Math.floor(Date.now() / 1000) - ageMinSeconds;
  return db
    .select()
    .from(matches)
    .where(
      and(
        ne(matches.status, "finished"),
        isNotNull(matches.whoscoredMatchId),
        lt(matches.kickoffUtc, cutoff),
      ),
    );
}
