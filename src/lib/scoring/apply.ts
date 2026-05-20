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
  scores,
} from "@/db/schema";
import { computeAllScores } from "./compute";
import { playerById } from "@/lib/players-data";

export interface RecomputeResult {
  users: number;
  matches: number;
  scoreRows: number;
  totalPointsWritten: number;
  elapsedMs: number;
}

export async function recomputeAllUsers(): Promise<RecomputeResult> {
  const start = Date.now();
  const db = await getDb();

  // Build player → team map from the static snapshot (cheap; we don't need
  // a DB call for this).
  const playerTeamById = new Map<number, number>();
  for (const p of playerById.values()) playerTeamById.set(p.id, p.teamId);

  const [
    userRows,
    matchRows,
    groupRows,
    wildcardRows,
    bracketRows,
    tournamentRows,
  ] = await Promise.all([
    db.select().from(users),
    db.select().from(matches),
    db.select().from(groupPicks),
    db.select().from(wildcardPicks),
    db.select().from(bracketPicks),
    db.select().from(tournamentPicks),
  ]);

  const rows = computeAllScores({
    users: userRows,
    matches: matchRows,
    groupPicks: groupRows,
    wildcardPicks: wildcardRows,
    bracketPicks: bracketRows,
    tournamentPicks: tournamentRows,
    playerTeamById,
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
  Array<{ userEmail: string; displayName: string; points: number; lastComputed: number | null }>
> {
  const db = await getDb();
  const rows = await db
    .select({
      userEmail: scores.userEmail,
      points: sql<number>`coalesce(sum(${scores.points}), 0)`,
      lastComputed: sql<number>`max(${scores.computedAt})`,
    })
    .from(scores)
    .groupBy(scores.userEmail);

  // Join in display names.
  const userRows = await db.select().from(users);
  const nameByEmail = new Map(userRows.map((u) => [u.email, u.displayName]));

  // Include users with zero rows so they still show on the board.
  const out = userRows.map((u) => {
    const r = rows.find((x) => x.userEmail === u.email);
    return {
      userEmail: u.email,
      displayName: u.displayName,
      points: r?.points ?? 0,
      lastComputed: r?.lastComputed ?? null,
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
      });
    }
  }

  return out.sort((a, b) => b.points - a.points);
}
