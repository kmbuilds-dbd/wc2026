/**
 * POST /api/admin/scrape-match
 *
 * Body: { url: string }
 *
 * Pulls a FotMob match URL and returns the parsed result + stats snapshot.
 * Does not write to D1.
 *
 * Gated by requirePrivileged — admin or x-cron-secret.
 */
import { NextResponse, type NextRequest } from "next/server";
import { requirePrivileged, UnauthenticatedError } from "@/lib/auth";
import { scrapeFotmobMatchUrl } from "@/lib/fotmob/scrape-and-save";

export async function POST(request: NextRequest) {
  try {
    await requirePrivileged(request);
  } catch (e) {
    if (e instanceof UnauthenticatedError) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    throw e;
  }

  const body = (await request.json().catch(() => ({}))) as { url?: string };
  if (!body.url || !/^https:\/\/www\.fotmob\.com\/matches\//.test(body.url)) {
    return NextResponse.json(
      {
        ok: false,
        error: "Provide a valid FotMob match URL (https://www.fotmob.com/matches/...)",
      },
      { status: 400 },
    );
  }

  try {
    const result = await scrapeFotmobMatchUrl(body.url);
    return NextResponse.json({
      ok: true,
      match: {
        status: result.status,
        homeScore: result.homeScore,
        awayScore: result.awayScore,
        fotmob: result.snapshot,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
