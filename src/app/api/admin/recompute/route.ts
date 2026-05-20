/**
 * POST /api/admin/recompute — trigger idempotent re-scoring of all users.
 * Privileged (admin email or x-cron-secret header).
 */
import { NextResponse, type NextRequest } from "next/server";
import { requirePrivileged, UnauthenticatedError } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    await requirePrivileged(request);
    // TODO Day 9–11: call recomputeAllUsers(db) from src/lib/scoring/apply.ts
    return NextResponse.json({ ok: false, error: "Not yet implemented" }, { status: 501 });
  } catch (e) {
    if (e instanceof UnauthenticatedError) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    throw e;
  }
}
