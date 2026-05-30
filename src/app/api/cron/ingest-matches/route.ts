/**
 * Cron sweeper: pull eligible D1 matches via FotMob and persist
 * finished results.
 *
 * Eligibility: kickoffUtc < now - 4h, status != "finished", FotMob match id
 * is set. Runs every 30 min per wrangler.jsonc triggers.crons.
 *
 * Two ways this fires:
 *   - production: CF cron → scheduled() worker handler → fetch with
 *     x-cron-secret (WORKER_SELF_REFERENCE wired by opennextjs adapter)
 *   - admin: manual POST with admin auth or x-cron-secret
 *
 * Matches are checked after the game should be complete; finished matches
 * drop out of the eligible set after the first successful write.
 */
import { NextResponse, type NextRequest } from "next/server";
import { requirePrivileged, UnauthenticatedError } from "@/lib/auth";
import { getDb } from "@/db/client";
import {
  findEligibleMatches,
  scrapeAndSaveRow,
  type SaveReport,
} from "@/lib/fotmob/scrape-and-save";
import { recomputeAllUsers, type RecomputeResult } from "@/lib/scoring/apply";

export const maxDuration = 240;

export async function POST(request: NextRequest) {
  try {
    await requirePrivileged(request);
  } catch (e) {
    if (e instanceof UnauthenticatedError) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    throw e;
  }

  const db = await getDb();
  const eligible = await findEligibleMatches(db);

  const reports: SaveReport[] = [];
  for (const row of eligible) {
    try {
      reports.push(await scrapeAndSaveRow(row, db));
    } catch (e) {
      reports.push({
        matchId: row.id,
        homeTeamId: row.homeTeamId ?? 0,
        awayTeamId: row.awayTeamId ?? 0,
        homeScore: row.homeScore,
        awayScore: row.awayScore,
        status: row.status,
        events: [],
        unresolvedPlayers: [],
        written: false,
        sourceUrl: null,
        error:
          e instanceof Error
            ? e.message
            : String(e),
      });
    }
  }

  const writtenCount = reports.filter((r) => r.written).length;

  // Recompute the leaderboard only when at least one match flipped to
  // finished. Otherwise no scores can have changed.
  let recompute: RecomputeResult | null = null;
  if (writtenCount > 0) {
    recompute = await recomputeAllUsers();
  }

  return NextResponse.json({
    ok: true,
    eligibleCount: eligible.length,
    writtenCount,
    recompute,
    reports,
  });
}
