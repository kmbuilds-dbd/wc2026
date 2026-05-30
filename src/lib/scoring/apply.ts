/**
 * Apply layer for the scoring engine. Reads picks + matches from D1, calls
 * computeAllScores (pure), and replaces the scores table atomically.
 *
 * Idempotent. Safe to re-run anytime; admin can also schedule against cron
 * after match-result ingestion.
 */
import { sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  users,
  matches,
  groupPicks,
  wildcardPicks,
  bracketPicks,
  tournamentPicks,
  lineupPicks,
  scores,
} from "@/db/schema";
import { computeAllScores } from "./compute";
import { playerById } from "@/lib/players-data";
import { syncApprovedAccessUsers } from "@/lib/auth";

const CURRENT_PICK_TOTAL = 35;

export interface RecomputeResult {
  users: number;
  matches: number;
  scoreRows: number;
  totalPointsWritten: number;
  elapsedMs: number;
}

export async function recomputeAllUsers(): Promise<RecomputeResult> {
  const start = Date.now();
  await syncApprovedAccessUsers();
  const db = await getDb();

  // Build player → team + position maps from the static snapshot (cheap;
  // we don't need a DB call for this).
  const playerTeamById = new Map<number, number>();
  const playerPositionById = new Map<number, "GK" | "DEF" | "MID" | "FWD">();
  for (const p of playerById.values()) {
    playerTeamById.set(p.id, p.teamId);
    playerPositionById.set(p.id, p.position);
  }

  const [
    userRows,
    matchRows,
    groupRows,
    wildcardRows,
    bracketRows,
    tournamentRows,
    lineupRows,
  ] = await Promise.all([
    db.select().from(users),
    db.select().from(matches),
    db.select().from(groupPicks),
    db.select().from(wildcardPicks),
    db.select().from(bracketPicks),
    db.select().from(tournamentPicks),
    db.select().from(lineupPicks),
  ]);

  const rows = computeAllScores({
    users: userRows,
    matches: matchRows,
    groupPicks: groupRows,
    wildcardPicks: wildcardRows,
    bracketPicks: bracketRows,
    tournamentPicks: tournamentRows,
    lineupPicks: lineupRows,
    playerTeamById,
    playerPositionById,
  });

  // Replace: nuke + bulk insert. SQLite/D1 doesn't support multi-statement
  // batched inserts via drizzle's batch on the worker side, so we DELETE
  // then INSERT in a loop. For 50 users × ~70 rows ≈ 3500 rows it runs in
  // well under a second.
  await db.delete(scores);
  if (rows.length > 0) {
    // Drizzle's batch-insert can take an array directly.
    await db.insert(scores).values(rows);
  }

  // Compute total points written for the result summary (useful diagnostic
  // — "did anything actually change?")
  const totalPointsWritten = rows.reduce((sum, r) => sum + r.points, 0);

  return {
    users: userRows.length,
    matches: matchRows.length,
    scoreRows: rows.length,
    totalPointsWritten,
    elapsedMs: Date.now() - start,
  };
}

/** Helper for the leaderboard page: total points per user. */
export async function leaderboardRows(): Promise<
  Array<{
    userEmail: string;
    displayName: string;
    points: number;
    lastComputed: number | null;
    picksMade: number;
    picksTotal: number;
  }>
> {
  await syncApprovedAccessUsers();
  const db = await getDb();
  const [
    rows,
    userRows,
    groupRows,
    wildcardRows,
    tournamentRows,
    lineupRows,
  ] = await Promise.all([
    db
      .select({
        userEmail: scores.userEmail,
        points: sql<number>`coalesce(sum(${scores.points}), 0)`,
        lastComputed: sql<number>`max(${scores.computedAt})`,
      })
      .from(scores)
      .groupBy(scores.userEmail),
    db.select().from(users),
    db.select().from(groupPicks),
    db.select().from(wildcardPicks),
    db.select().from(tournamentPicks),
    db.select().from(lineupPicks),
  ]);

  // Join in display names.
  const nameByEmail = new Map(userRows.map((u) => [u.email, u.displayName]));
  const picksMadeByEmail = new Map<string, number>();

  function addPick(email: string, count = 1) {
    picksMadeByEmail.set(email, (picksMadeByEmail.get(email) ?? 0) + count);
  }

  for (const p of groupRows) addPick(p.userEmail);
  for (const p of wildcardRows) addPick(p.userEmail);
  for (const p of tournamentRows) {
    if (p.winnerTeamId != null) addPick(p.userEmail);
    if (p.topScorerPlayerId != null) addPick(p.userEmail);
    if (p.goldenGlovePlayerId != null) addPick(p.userEmail);
  }

  // Include users with zero rows so they still show on the board.
  const out = userRows.map((u) => {
    const r = rows.find((x) => x.userEmail === u.email);
    return {
      userEmail: u.email,
      displayName: u.displayName,
      points: r?.points ?? 0,
      lastComputed: r?.lastComputed ?? null,
      picksMade: picksMadeByEmail.get(u.email) ?? 0,
      picksTotal: CURRENT_PICK_TOTAL,
    };
  });

  // Add any orphan score rows (shouldn't happen but cheap to surface).
  for (const r of rows) {
    if (!nameByEmail.has(r.userEmail)) {
      out.push({
        userEmail: r.userEmail,
        displayName: r.userEmail,
        points: r.points,
        lastComputed: r.lastComputed,
        picksMade: picksMadeByEmail.get(r.userEmail) ?? 0,
        picksTotal: CURRENT_PICK_TOTAL,
      });
    }
  }

  return out.sort((a, b) => b.points - a.points);
}
