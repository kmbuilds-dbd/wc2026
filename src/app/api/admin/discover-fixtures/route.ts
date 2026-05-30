/**
 * POST /api/admin/discover-fixtures
 *
 * No body. Hits FotMob's WC 2026 fixture page, parses its embedded Next.js
 * payload, and returns fixtures with FotMob match IDs, team
 * names, and kickoffs.
 *
 * Use sparingly — run once to populate, then re-run when matchups or kickoffs
 * change.
 *
 * Gated by requirePrivileged.
 */
import { NextResponse, type NextRequest } from "next/server";
import { requirePrivileged, UnauthenticatedError } from "@/lib/auth";
import { discoverAllWcFixtures } from "@/lib/fotmob/fixtures";

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

  try {
    const result = await discoverAllWcFixtures();
    return NextResponse.json({
      ok: true,
      totalFixtures: result.fixtures.length,
      stages: result.stages,
      fixtures: result.fixtures,
      ...(!result.fixtures.length
        ? { warning: "FotMob loaded, but no fixtures were parsed." }
        : {}),
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
