/**
 * POST /api/admin/refresh-squads
 *
 * Pulls the live squads JSON from the legacy worker
 * (https://wc2026-squads.followbuilders.workers.dev/teams.json) and caches
 * it in the CACHE KV namespace under `squads:latest`. The /teams page
 * reads from KV first, falling back to the bundled snapshot.
 *
 * Gated by requirePrivileged — admin or x-cron-secret.
 */
import { NextResponse, type NextRequest } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { requirePrivileged, UnauthenticatedError } from "@/lib/auth";

const LEGACY_TEAMS_URL =
  "https://wc2026-squads.followbuilders.workers.dev/teams.json";

const KV_KEY = "squads:latest";
const KV_KEY_FETCHED_AT = "squads:latest:fetchedAt";

export async function POST(request: NextRequest) {
  try {
    await requirePrivileged(request);
  } catch (e) {
    if (e instanceof UnauthenticatedError) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    throw e;
  }

  const res = await fetch(LEGACY_TEAMS_URL, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    return NextResponse.json(
      { ok: false, error: `Upstream ${res.status} from ${LEGACY_TEAMS_URL}` },
      { status: 502 },
    );
  }

  const body = await res.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return NextResponse.json(
      { ok: false, error: "Upstream returned non-JSON" },
      { status: 502 },
    );
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    return NextResponse.json(
      { ok: false, error: "Upstream returned empty or non-array squads" },
      { status: 502 },
    );
  }

  const { env } = await getCloudflareContext({ async: true });
  const fetchedAt = Math.floor(Date.now() / 1000);
  await env.CACHE.put(KV_KEY, body);
  await env.CACHE.put(KV_KEY_FETCHED_AT, String(fetchedAt));

  return NextResponse.json({
    ok: true,
    teams: parsed.length,
    fetchedAt,
  });
}
