/**
 * POST /api/admin/match-result — record a single finished match.
 *
 * Privileged (admin email or x-cron-secret header). Idempotent on
 * (id) — re-posting the same match id overwrites.
 *
 * Required JSON body:
 *   {
 *     id: number,                     // unique match id (admin-chosen; for
 *                                     // hybrid manual scoring we suggest
 *                                     // YYYYMMDDhh-style values, e.g.
 *                                     // 2026061120 = Jun 11 2026 20:00)
 *     stage: 'group'|'r32'|'r16'|'qf'|'sf'|'final'|'3p',
 *     groupLetter?: 'A'..'L',         // required when stage='group'
 *     homeTeamId: number,             // synthetic id (see teams-data.ts)
 *     awayTeamId: number,
 *     homeScore: number,
 *     awayScore: number,
 *     kickoffUtc: number,             // unix seconds
 *     scorers?: Array<{ playerId: number, teamId: number, minute?: number }>
 *   }
 *
 * Auto-triggers a recompute after the upsert so the leaderboard is fresh.
 */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requirePrivileged, UnauthenticatedError } from "@/lib/auth";
import { getDb } from "@/db/client";
import { matches } from "@/db/schema";
import { recomputeAllUsers } from "@/lib/scoring/apply";
import type { MatchEvent } from "@/lib/scoring/compute";

const BodySchema = z.object({
  id: z.number().int(),
  stage: z.enum(["group", "r32", "r16", "qf", "sf", "final", "3p"]),
  groupLetter: z.string().length(1).optional().nullable(),
  homeTeamId: z.number().int(),
  awayTeamId: z.number().int(),
  homeScore: z.number().int().min(0),
  awayScore: z.number().int().min(0),
  kickoffUtc: z.number().int(),
  scorers: z
    .array(
      z.object({
        playerId: z.number().int(),
        teamId: z.number().int(),
        minute: z.number().int().optional(),
      }),
    )
    .optional(),
});

export async function POST(request: NextRequest) {
  try {
    await requirePrivileged(request);
  } catch (e) {
    if (e instanceof UnauthenticatedError) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    throw e;
  }

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await request.json());
  } catch (e) {
    return NextResponse.json(
      { error: "Invalid body", detail: e instanceof Error ? e.message : String(e) },
      { status: 400 },
    );
  }

  if (body.stage === "group" && !body.groupLetter) {
    return NextResponse.json(
      { error: "groupLetter is required when stage='group'" },
      { status: 400 },
    );
  }

  const events: MatchEvent[] = (body.scorers ?? []).map((s) => ({
    type: "goal",
    playerId: s.playerId,
    teamId: s.teamId,
    ...(s.minute !== undefined ? { minute: s.minute } : {}),
  }));

  const now = Math.floor(Date.now() / 1000);

  const db = await getDb();
  await db
    .insert(matches)
    .values({
      id: body.id,
      stage: body.stage,
      groupLetter: body.groupLetter ?? null,
      homeTeamId: body.homeTeamId,
      awayTeamId: body.awayTeamId,
      kickoffUtc: body.kickoffUtc,
      homeScore: body.homeScore,
      awayScore: body.awayScore,
      status: "finished",
      ingestedAt: now,
      rawEvents: events,
    })
    .onConflictDoUpdate({
      target: matches.id,
      set: {
        stage: body.stage,
        groupLetter: body.groupLetter ?? null,
        homeTeamId: body.homeTeamId,
        awayTeamId: body.awayTeamId,
        kickoffUtc: body.kickoffUtc,
        homeScore: body.homeScore,
        awayScore: body.awayScore,
        status: "finished",
        ingestedAt: now,
        rawEvents: events,
      },
    });

  const recompute = await recomputeAllUsers();

  return NextResponse.json({ ok: true, matchId: body.id, recompute });
}
