/**
 * Internal cron endpoint: refresh The Odds API responses, store snapshots.
 *
 * TODO Day 16–17: implement the actual odds-refresh pipeline.
 */
import { NextResponse, type NextRequest } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { requireAdmin, UnauthenticatedError } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const cronSecret = request.headers.get("x-cron-secret");
  const { env } = await getCloudflareContext({ async: true });
  const expected = (env as unknown as { CRON_SECRET?: string }).CRON_SECRET;

  if (!expected || cronSecret !== expected) {
    try {
      await requireAdmin();
    } catch (e) {
      if (e instanceof UnauthenticatedError) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      throw e;
    }
  }

  return NextResponse.json({ ok: false, error: "Not yet implemented" }, { status: 501 });
}
