/**
 * POST /api/admin/odds-probe
 *
 * Diagnostic: list every sport key The Odds API knows about, filter to the
 * ones that look WC-2026-relevant (substring match on title + key), and
 * return them so we can pick the right outright sport keys to fetch from
 * the refresh-odds cron.
 *
 * Will be deleted once refresh.ts is wired against the discovered keys.
 */
import { NextResponse, type NextRequest } from "next/server";
import { requirePrivileged, UnauthenticatedError } from "@/lib/auth";
import { fetchAllSports, OddsApiError } from "@/lib/odds/client";

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
    const all = await fetchAllSports();
    const candidates = all.filter((s) => {
      const text = `${s.key} ${s.title} ${s.description}`.toLowerCase();
      return text.includes("world cup") || text.includes("fifa");
    });
    return NextResponse.json({
      ok: true,
      total_sports: all.length,
      wc_candidates: candidates,
      outright_only_candidates: candidates.filter((s) => s.has_outrights),
    });
  } catch (e) {
    if (e instanceof OddsApiError) {
      return NextResponse.json(
        { ok: false, error: e.message, status: e.status, body: e.body },
        { status: 502 },
      );
    }
    throw e;
  }
}
