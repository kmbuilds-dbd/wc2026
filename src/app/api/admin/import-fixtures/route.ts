/**
 * POST /api/admin/import-fixtures
 *
 * Body (optional): { dryRun?: boolean }
 *
 * Runs discoverAllWcFixtures(), maps each scraped fixture to our team_ids
 * and stage enum, then upserts into D1 `matches`. Uses the WhoScored match
 * ID as the D1 matches.id so re-runs are idempotent and the scrape-and-save
 * endpoint can look up matches by D1 id.
 *
 * Skips fixtures where team names can't be resolved — those are reported
 * back so the admin can fix the alias table.
 *
 * Costs 13 Firecrawl calls per invocation. Use dryRun=true to preview
 * without writing.
 *
 * Gated by requirePrivileged.
 */
import { NextResponse, type NextRequest } from "next/server";
import { requirePrivileged, UnauthenticatedError } from "@/lib/auth";
import { getDb } from "@/db/client";
import { matches } from "@/db/schema";
import { discoverAllWcFixtures, deriveStage } from "@/lib/whoscored/fixtures";
import { resolveTeamId } from "@/lib/whoscored/name-match";

export const maxDuration = 180;

interface ImportRow {
  matchId: number;
  whoscoredMatchId: string;
  stage: "group" | "r32" | "r16" | "qf" | "sf" | "final" | "3p";
  groupLetter: string | null;
  homeTeamId: number;
  awayTeamId: number;
  kickoffUtc: number;
}

interface ImportSkip {
  whoscoredMatchId: string;
  reason: string;
  homeTeam: string;
  awayTeam: string;
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

  const body = (await request.json().catch(() => ({}))) as { dryRun?: boolean };

  const { fixtures, stages } = await discoverAllWcFixtures();

  const toImport: ImportRow[] = [];
  const skipped: ImportSkip[] = [];

  for (const f of fixtures) {
    const home = resolveTeamId(f.homeTeam);
    const away = resolveTeamId(f.awayTeam);
    if (!home || !away) {
      skipped.push({
        whoscoredMatchId: f.whoscoredMatchId,
        reason: `Unresolved teams: home="${f.homeTeam}" → ${home?.id ?? "null"}; away="${f.awayTeam}" → ${away?.id ?? "null"}`,
        homeTeam: f.homeTeam,
        awayTeam: f.awayTeam,
      });
      continue;
    }
    if (f.kickoffUtc == null) {
      skipped.push({
        whoscoredMatchId: f.whoscoredMatchId,
        reason: "Missing kickoff",
        homeTeam: f.homeTeam,
        awayTeam: f.awayTeam,
      });
      continue;
    }
    const { stage, groupLetter } = deriveStage(f.stageLabel, f.kickoffUtc);
    toImport.push({
      matchId: Number(f.whoscoredMatchId),
      whoscoredMatchId: f.whoscoredMatchId,
      stage,
      groupLetter,
      homeTeamId: home.id,
      awayTeamId: away.id,
      kickoffUtc: f.kickoffUtc,
    });
  }

  let written = 0;
  if (!body.dryRun) {
    const db = await getDb();
    for (const r of toImport) {
      await db
        .insert(matches)
        .values({
          id: r.matchId,
          stage: r.stage,
          groupLetter: r.groupLetter,
          homeTeamId: r.homeTeamId,
          awayTeamId: r.awayTeamId,
          kickoffUtc: r.kickoffUtc,
          homeScore: null,
          awayScore: null,
          status: "scheduled",
          ingestedAt: null,
          rawEvents: null,
          whoscoredMatchId: r.whoscoredMatchId,
        })
        .onConflictDoUpdate({
          target: matches.id,
          set: {
            stage: r.stage,
            groupLetter: r.groupLetter,
            homeTeamId: r.homeTeamId,
            awayTeamId: r.awayTeamId,
            kickoffUtc: r.kickoffUtc,
            whoscoredMatchId: r.whoscoredMatchId,
          },
        });
      written++;
    }
  }

  return NextResponse.json({
    ok: true,
    dryRun: !!body.dryRun,
    scrapedTotal: fixtures.length,
    importedOrPreview: toImport.length,
    written,
    skipped,
    stages,
    sample: toImport.slice(0, 5),
  });
}
