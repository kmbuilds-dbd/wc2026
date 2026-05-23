/**
 * POST /api/admin/scrape-and-save
 *
 * Body: { matchId: number } OR { url: string, matchId?: number }
 *
 * Scrapes a WhoScored match URL, resolves team + player names to our IDs,
 * builds MatchEvent[], and upserts homeScore / awayScore / status /
 * raw_events into D1 `matches`.
 *
 * If `matchId` is provided, the row must already exist (we don't create
 * fixtures here — use /api/admin/discover-fixtures + a fixture-import job
 * for that).
 *
 * Returns the parsed match plus a per-event resolution report so the admin
 * can spot unmatched players.
 *
 * Gated by requirePrivileged.
 */
import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { requirePrivileged, UnauthenticatedError } from "@/lib/auth";
import { getDb } from "@/db/client";
import { matches } from "@/db/schema";
import { scrapeMatch, FirecrawlError, type ScrapedMatch } from "@/lib/whoscored/scrape";
import { resolveTeamId, resolvePlayerId } from "@/lib/whoscored/name-match";
import type { MatchEvent } from "@/lib/scoring/compute";

export const maxDuration = 60;

interface ResolvedEvent {
  type: "goal" | "own_goal" | "assist";
  minute: number;
  playerName: string;
  wsPlayerId: string;
  playerId: number | null; // null = unresolved
  teamId: number;
}

interface SaveReport {
  matchId: number | null;
  homeTeamId: number;
  awayTeamId: number;
  homeScore: number | null;
  awayScore: number | null;
  status: "scheduled" | "live" | "finished";
  events: ResolvedEvent[];
  unresolvedPlayers: Array<{ name: string; wsPlayerId: string; teamId: number }>;
  written: boolean;
}

function buildEvents(scraped: ScrapedMatch, homeTeamId: number, awayTeamId: number) {
  const events: ResolvedEvent[] = [];
  const unresolved: SaveReport["unresolvedPlayers"] = [];

  for (const goal of scraped.goals) {
    const benefitTeamId = goal.side === "home" ? homeTeamId : awayTeamId;
    // For OG the SCORER plays for the OPPOSING team (not the side that benefited).
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

    for (const assister of goal.assisters) {
      if (goal.ownGoal) continue; // OGs don't generate assist credit
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

export async function POST(request: NextRequest) {
  try {
    await requirePrivileged(request);
  } catch (e) {
    if (e instanceof UnauthenticatedError) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    throw e;
  }

  const body = (await request.json().catch(() => ({}))) as {
    matchId?: number;
    url?: string;
  };

  const db = await getDb();

  // Resolve URL: either explicit, or derived from D1 matchId's whoscored_match_id.
  let url = body.url;
  let dbMatchId: number | null = body.matchId ?? null;
  if (!url && dbMatchId != null) {
    const row = await db.select().from(matches).where(eq(matches.id, dbMatchId)).get();
    if (!row) {
      return NextResponse.json({ ok: false, error: `D1 match ${dbMatchId} not found` }, { status: 404 });
    }
    if (!row.whoscoredMatchId) {
      return NextResponse.json(
        { ok: false, error: `D1 match ${dbMatchId} has no whoscored_match_id mapped yet` },
        { status: 400 },
      );
    }
    url = `https://www.whoscored.com/matches/${row.whoscoredMatchId}/show/whoscored-2026`;
  }
  if (!url || !/^https:\/\/www\.whoscored\.com\/matches\/\d+\//.test(url)) {
    return NextResponse.json(
      { ok: false, error: "Provide either { matchId } (with whoscored_match_id mapped) or a valid WhoScored URL" },
      { status: 400 },
    );
  }

  let scraped: ScrapedMatch;
  try {
    scraped = await scrapeMatch(url);
  } catch (e) {
    if (e instanceof FirecrawlError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: 502 });
    }
    throw e;
  }

  // Resolve teams.
  const home = resolveTeamId(scraped.homeTeam);
  const away = resolveTeamId(scraped.awayTeam);
  if (!home || !away) {
    return NextResponse.json(
      {
        ok: false,
        error: `Couldn't map team names. home="${scraped.homeTeam}" → ${home?.id ?? null}; away="${scraped.awayTeam}" → ${away?.id ?? null}`,
      },
      { status: 422 },
    );
  }

  const { events, unresolved } = buildEvents(scraped, home.id, away.id);

  const report: SaveReport = {
    matchId: dbMatchId,
    homeTeamId: home.id,
    awayTeamId: away.id,
    homeScore: scraped.homeScore,
    awayScore: scraped.awayScore,
    status: scraped.status,
    events,
    unresolvedPlayers: unresolved,
    written: false,
  };

  if (dbMatchId != null && scraped.status === "finished") {
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
      .where(eq(matches.id, dbMatchId));

    report.written = true;
  }

  return NextResponse.json({ ok: true, report });
}
