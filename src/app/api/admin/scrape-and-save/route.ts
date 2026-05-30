/**
 * POST /api/admin/scrape-and-save
 *
 * Body: { matchId: number } OR { url: string }
 *
 * Pulls a FotMob match and persists the result to D1. When `matchId`
 * is provided, reads the row from D1 (must have a FotMob match id set) and
 * uses scrapeAndSaveRow. When `url` is provided directly, returns the parsed
 * stats snapshot without writing.
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
import { scrapeAndSaveRow, scrapeFotmobMatchUrl } from "@/lib/fotmob/scrape-and-save";
import { recomputeAllUsers } from "@/lib/scoring/apply";

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
      const recompute = report.written ? await recomputeAllUsers() : null;
      return NextResponse.json({ ok: true, report, recompute });
    } catch (e) {
      return NextResponse.json(
        { ok: false, error: e instanceof Error ? e.message : String(e) },
        { status: 502 },
      );
    }
  }

  // Path B: URL provided — pull only, no write.
  if (!body.url || !/^https:\/\/www\.fotmob\.com\/matches\//.test(body.url)) {
    return NextResponse.json(
      { ok: false, error: "Provide { matchId } (writes to D1) or { url } (preview only)" },
      { status: 400 },
    );
  }

  try {
    const scraped = await scrapeFotmobMatchUrl(body.url);
    return NextResponse.json({
      ok: true,
      preview: true,
      status: scraped.status,
      homeScore: scraped.homeScore,
      awayScore: scraped.awayScore,
      fotmob: scraped.snapshot,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
