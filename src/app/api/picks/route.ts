/**
 * Picks API. v1: stubs returning 501 — Day 6–8 work lands the upsert logic.
 *
 * GET  /api/picks                     → list current user's picks
 * POST /api/picks                     → upsert pick (body: { category, key, value })
 */
import { NextResponse } from "next/server";
import { requireUser, UnauthenticatedError } from "@/lib/auth";

export async function GET() {
  try {
    await requireUser();
    return NextResponse.json({ ok: true, picks: [] }, { status: 501 });
  } catch (e) {
    if (e instanceof UnauthenticatedError) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }
    throw e;
  }
}

export async function POST() {
  try {
    await requireUser();
    return NextResponse.json({ ok: false, error: "Not yet implemented" }, { status: 501 });
  } catch (e) {
    if (e instanceof UnauthenticatedError) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }
    throw e;
  }
}
