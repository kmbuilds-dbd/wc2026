/**
 * Internal cron endpoint: ingest finished matches from api-sports, persist
 * raw events to D1, then trigger re-scoring.
 *
 * Two ways this fires:
 *  - production: wrangler `triggers.crons` invokes the worker's `scheduled`
 *    handler, which `await env.WORKER_SELF_REFERENCE.fetch(...)` on this URL
 *    with a CRON_SECRET header
 *  - dev / admin: any authenticated admin can POST manually to re-run
 *
 * TODO Day 9–11: implement the actual ingestion + scoring pipeline.
 */
import { NextResponse, type NextRequest } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { requireAdmin, UnauthenticatedError } from "@/lib/auth";

export async function POST(request: NextRequest) {
  // Path A: cron-triggered via WORKER_SELF_REFERENCE
  const cronSecret = request.headers.get("x-cron-secret");
  const { env } = await getCloudflareContext({ async: true });
  const expected = (env as unknown as { CRON_SECRET?: string }).CRON_SECRET;

  if (!expected || cronSecret !== expected) {
    // Path B: admin can also manually trigger
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
