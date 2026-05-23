/**
 * POST /api/admin/scrape-fixtures
 *
 * Body: { url: string }
 *
 * Calls the WhoScored fixtures-page scraper (via Firecrawl) and returns the
 * parsed list of fixtures (match id, URL, teams, kickoff). Does NOT write to
 * D1 yet — admin reviews the list before persisting.
 *
 * Use this against each of the 12 WC group stage URLs + the Final Stage URL
 * to discover all 104 match URLs.
 *
 * Gated by requirePrivileged — admin or x-cron-secret.
 */
import { NextResponse, type NextRequest } from "next/server";
import { requirePrivileged, UnauthenticatedError } from "@/lib/auth";
import { scrapeFixtures } from "@/lib/whoscored/fixtures";
import { FirecrawlError } from "@/lib/whoscored/scrape";

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
  if (
    !body.url ||
    !/^https:\/\/www\.whoscored\.com\/regions\/\d+\/tournaments\/\d+\/seasons\/\d+\/stages\/\d+\/fixtures\//.test(
      body.url,
    )
  ) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Provide a stage fixtures URL (https://www.whoscored.com/regions/<r>/tournaments/<t>/seasons/<s>/stages/<st>/fixtures/...)",
      },
      { status: 400 },
    );
  }

  try {
    const fixtures = await scrapeFixtures(body.url);
    return NextResponse.json({
      ok: true,
      count: fixtures.length,
      fixtures,
    });
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
