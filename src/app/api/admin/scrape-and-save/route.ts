/**
 * POST /api/admin/scrape-and-save
 *
 * Body: { matchId: number } OR { url: string }
 *
 * Scrapes a WhoScored match and persists the result to D1. When `matchId`
 * is provided, reads the row from D1 (must have whoscored_match_id set) and
 * uses scrapeAndSaveRow. When `url` is provided directly, returns the parsed
 * payload without writing (preview mode for unmapped URLs).
 *
 * Returns per-event resolution + unresolvedPlayers report.
 *
 * Gated by requirePrivileged.
 */
import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { requirePrivileged, UnauthenticatedError } from "@/lib/auth";
import { getDb } from "@/db/client";
import { matches } from "@/db/schema";
import { scrapeMatch, FirecrawlError } from "@/lib/whoscored/scrape";
import { scrapeAndSaveRow } from "@/lib/whoscored/scrape-and-save";
import { resolveTeamId } from "@/lib/whoscored/name-match";

export const maxDuration = 60;

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

  // Path A: matchId provided — D1 row drives the scrape + write.
  if (body.matchId != null) {
    const row = await db.select().from(matches).where(eq(matches.id, body.matchId)).get();
    if (!row) {
      return NextResponse.json(
        { ok: false, error: `D1 match ${body.matchId} not found` },
        { status: 404 },
      );
    }
    try {
      const report = await scrapeAndSaveRow(row, db);
      return NextResponse.json({ ok: true, report });
    } catch (e) {
      if (e instanceof FirecrawlError) {
        return NextResponse.json({ ok: false, error: e.message }, { status: 502 });
      }
      throw e;
    }
  }

  // Path B: URL provided — scrape only, no write.
  if (!body.url || !/^https:\/\/www\.whoscored\.com\/matches\/\d+\//.test(body.url)) {
    return NextResponse.json(
      { ok: false, error: "Provide { matchId } (writes to D1) or { url } (preview only)" },
      { status: 400 },
    );
  }

  try {
    const scraped = await scrapeMatch(body.url);
    const home = resolveTeamId(scraped.homeTeam);
    const away = resolveTeamId(scraped.awayTeam);
    return NextResponse.json({
      ok: true,
      preview: true,
      scraped: { ...scraped, rawMarkdown: undefined },
      resolvedHomeTeamId: home?.id ?? null,
      resolvedAwayTeamId: away?.id ?? null,
    });
  } catch (e) {
    if (e instanceof FirecrawlError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: 502 });
    }
    throw e;
  }
}
