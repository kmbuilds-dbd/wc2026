/**
 * POST /api/admin/seed?what=teams|fixtures|all
 *
 * Admin-only. Triggers idempotent seeding from api-sports.io.
 *
 * Order matters: fixtures depend on teams (for group_letter lookup), so
 * `what=all` runs teams then fixtures.
 *
 * Usage:
 *   curl -X POST 'https://wc2026.<sub>.workers.dev/api/admin/seed?what=all' \
 *     -H 'x-dev-user-email: <admin>'   # dev only — prod uses CF Access header
 */
import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin, UnauthenticatedError } from "@/lib/auth";
import { seedTeams } from "@/lib/seed/teams";
import { seedFixtures } from "@/lib/seed/fixtures";
import { ApiSportsError } from "@/lib/api-sports/client";

type What = "teams" | "fixtures" | "all";
const VALID: What[] = ["teams", "fixtures", "all"];

export async function POST(request: NextRequest) {
  try {
    await requireAdmin();
  } catch (e) {
    if (e instanceof UnauthenticatedError) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    throw e;
  }

  const what = (new URL(request.url).searchParams.get("what") ?? "all") as What;
  if (!VALID.includes(what)) {
    return NextResponse.json(
      { error: `?what must be one of ${VALID.join(", ")}` },
      { status: 400 },
    );
  }

  try {
    const out: Record<string, unknown> = { ok: true, what };
    if (what === "teams" || what === "all") {
      out.teams = await seedTeams();
    }
    if (what === "fixtures" || what === "all") {
      out.fixtures = await seedFixtures();
    }
    return NextResponse.json(out);
  } catch (e) {
    if (e instanceof ApiSportsError) {
      return NextResponse.json(
        { ok: false, error: e.message, status: e.status, body: e.body },
        { status: 502 },
      );
    }
    throw e;
  }
}
