/**
 * POST /api/admin/recompute — trigger idempotent re-scoring of all users.
 * Admin email only.
 */
import { NextResponse } from "next/server";
import { requireAdmin, UnauthenticatedError } from "@/lib/auth";

export async function POST() {
  try {
    await requireAdmin();
    // TODO Day 9–11: call recomputeAllUsers(db) from src/lib/scoring/apply.ts
    return NextResponse.json({ ok: false, error: "Not yet implemented" }, { status: 501 });
  } catch (e) {
    if (e instanceof UnauthenticatedError) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    throw e;
  }
}
