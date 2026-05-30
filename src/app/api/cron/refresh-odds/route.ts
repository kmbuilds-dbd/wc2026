/**
 * POST /api/cron/refresh-odds — pull WC 2026 market data from Kalshi
 * and persist as odds_snapshots rows.
 *
 * Fires daily at 06:00 UTC via wrangler.jsonc → triggers.crons. Also
 * callable manually with x-cron-secret or as admin (requirePrivileged).
 */
import { NextResponse, type NextRequest } from "next/server";
import { requirePrivileged, UnauthenticatedError } from "@/lib/auth";
import { refreshOdds } from "@/lib/odds/refresh";
import { KalshiApiError } from "@/lib/odds/kalshi";

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
    const result = await refreshOdds();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    if (e instanceof KalshiApiError) {
      return NextResponse.json(
        { ok: false, error: e.message, status: e.status, body: e.body },
        { status: 502 },
      );
    }
    throw e;
  }
}
