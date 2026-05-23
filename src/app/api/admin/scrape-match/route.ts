/**
 * POST /api/admin/scrape-match
 *
 * Body: { url: string }
 *
 * Calls the WhoScored scraper (via Firecrawl) and returns the parsed match
 * data. Does NOT yet write to D1 — admin can review the parsed output and
 * trigger a follow-up writer once name → player_id mapping is solved.
 *
 * Gated by requirePrivileged — admin or x-cron-secret.
 */
import { NextResponse, type NextRequest } from "next/server";
import { requirePrivileged, UnauthenticatedError } from "@/lib/auth";
import { scrapeMatch, FirecrawlError } from "@/lib/whoscored/scrape";

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
  if (!body.url || !/^https:\/\/www\.whoscored\.com\/matches\/\d+\//.test(body.url)) {
    return NextResponse.json(
      {
        ok: false,
        error: "Provide a valid WhoScored match URL (https://www.whoscored.com/matches/<id>/...)",
      },
      { status: 400 },
    );
  }

  try {
    const result = await scrapeMatch(body.url);
    // Don't send the full markdown back to the client (~35KB) unless debugging.
    const { rawMarkdown, ...trimmed } = result;
    void rawMarkdown;
    return NextResponse.json({ ok: true, match: trimmed });
  } catch (e) {
    if (e instanceof FirecrawlError) {
      return NextResponse.json(
        { ok: false, error: e.message, status: e.status ?? null },
        { status: 502 },
      );
    }
    throw e;
  }
}
