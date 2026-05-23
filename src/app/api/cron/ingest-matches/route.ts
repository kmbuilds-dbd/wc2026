/**
 * Cron sweeper: scrape eligible D1 matches via WhoScored and persist
 * finished results.
 *
 * Eligibility: kickoffUtc < now - 2h, status != "finished", whoscored_match_id
 * is set. Runs every 30 min per wrangler.jsonc triggers.crons.
 *
 * Two ways this fires:
 *   - production: CF cron → scheduled() worker handler → fetch with
 *     x-cron-secret (WORKER_SELF_REFERENCE wired by opennextjs adapter)
 *   - admin: manual POST with admin auth or x-cron-secret
 *
 * Firecrawl cost: one scrape per eligible match per cron tick. Live matches
 * get re-scraped every 30 min until they flip to "finished", then drop out
 * of the eligible set.
 */
import { NextResponse, type NextRequest } from "next/server";
import { requirePrivileged, UnauthenticatedError } from "@/lib/auth";
import { getDb } from "@/db/client";
import {
  findEligibleMatches,
  scrapeAndSaveRow,
  type SaveReport,
} from "@/lib/whoscored/scrape-and-save";
import { FirecrawlError } from "@/lib/whoscored/scrape";

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
        error:
          e instanceof FirecrawlError
            ? `firecrawl: ${e.message}`
            : e instanceof Error
              ? e.message
              : String(e),
      });
    }
  }

  const writtenCount = reports.filter((r) => r.written).length;

  return NextResponse.json({
    ok: true,
    eligibleCount: eligible.length,
    writtenCount,
    reports,
  });
}
