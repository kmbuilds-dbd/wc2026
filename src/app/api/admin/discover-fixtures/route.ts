/**
 * POST /api/admin/discover-fixtures
 *
 * No body. Hits all 13 hardcoded WC 2026 stage fixture pages on WhoScored
 * (12 groups + 1 final stage) via Firecrawl, parses each, and returns the
 * merged list of fixtures with WhoScored match IDs + team IDs + kickoffs.
 *
 * 13 Firecrawl calls per invocation. Use sparingly — run once to populate,
 * then re-run only when KO matchups are decided (Final Stage fills in
 * after group stage ends).
 *
 * Gated by requirePrivileged.
 */
import { NextResponse, type NextRequest } from "next/server";
import { requirePrivileged, UnauthenticatedError } from "@/lib/auth";
import { discoverAllWcFixtures } from "@/lib/whoscored/fixtures";

export const maxDuration = 120;

export async function POST(request: NextRequest) {
  try {
    await requirePrivileged(request);
  } catch (e) {
    if (e instanceof UnauthenticatedError) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    throw e;
  }

  const result = await discoverAllWcFixtures();
  return NextResponse.json({
    ok: true,
    totalFixtures: result.fixtures.length,
    stages: result.stages,
    fixtures: result.fixtures,
  });
}
