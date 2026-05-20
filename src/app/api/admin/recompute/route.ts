/**
 * POST /api/admin/recompute — trigger idempotent re-scoring of all users.
 * Privileged (admin email or x-cron-secret header).
 *
 * Returns counts so an admin can sanity-check the run.
 */
import { NextResponse, type NextRequest } from "next/server";
import { requirePrivileged, UnauthenticatedError } from "@/lib/auth";
import { recomputeAllUsers } from "@/lib/scoring/apply";

export async function POST(request: NextRequest) {
  try {
    await requirePrivileged(request);
  } catch (e) {
    if (e instanceof UnauthenticatedError) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    throw e;
  }

  const result = await recomputeAllUsers();
  return NextResponse.json({ ok: true, ...result });
}
