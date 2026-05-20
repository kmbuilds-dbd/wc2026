/**
 * Pick-lock policy. Single source of truth — every write path MUST call
 * `isLocked(category, round?)` before mutating.
 *
 * Lock points:
 *   - Tournament-level picks (group/wildcard/bracket/tournament) → first
 *     kickoff of the entire tournament
 *   - Per-round lineup picks → first kickoff of that KO round
 *
 * Source of timestamps:
 *   1. D1 `matches` table (after `seedFixtures()` has run)
 *   2. Fallback constants below for the empty-DB case so dev UI still works
 */
import { getStageKickoffs } from "@/lib/seed/fixtures";

export type PickCategory =
  | "group"
  | "wildcard"
  | "bracket"
  | "tournament"
  | "lineup";

export type LineupRound = "r32" | "r16" | "qf" | "sf" | "final";

/**
 * Approximate FIFA WC 2026 kickoffs. Used as a fallback when the matches
 * table is empty (pre-seed). Replaced by D1-derived values as soon as
 * `seedFixtures()` populates the table.
 *
 * First match: Jun 11 2026 20:00 UTC (group stage opener)
 * R32 starts: Jun 28 · R16: Jul 4 · QF: Jul 9 · SF: Jul 14 · F: Jul 19
 */
export const FALLBACK_KICKOFFS = {
  firstMatchUtc: 1749672000,
  r32: 1751155200,
  r16: 1751673600,
  qf: 1752105600,
  sf: 1752537600,
  final: 1752969600,
} as const;

/** Backwards-compatible export for the dashboard countdown. */
export const FIRST_KICKOFF_UTC = FALLBACK_KICKOFFS.firstMatchUtc;

export interface Kickoffs {
  firstMatchUtc: number;
  r32: number;
  r16: number;
  qf: number;
  sf: number;
  final: number;
}

/**
 * Resolve kickoff timestamps, preferring D1 values when available.
 * Falls back to FALLBACK_KICKOFFS for any stage that hasn't been seeded.
 */
export async function getKickoffs(): Promise<Kickoffs> {
  const fromDb = await getStageKickoffs();
  return {
    firstMatchUtc: fromDb.group ?? FALLBACK_KICKOFFS.firstMatchUtc,
    r32: fromDb.r32 ?? FALLBACK_KICKOFFS.r32,
    r16: fromDb.r16 ?? FALLBACK_KICKOFFS.r16,
    qf: fromDb.qf ?? FALLBACK_KICKOFFS.qf,
    sf: fromDb.sf ?? FALLBACK_KICKOFFS.sf,
    final: fromDb.final ?? FALLBACK_KICKOFFS.final,
  };
}

export async function isLocked(
  category: PickCategory,
  round?: LineupRound,
): Promise<boolean> {
  const k = await getKickoffs();
  const nowSec = Math.floor(Date.now() / 1000);
  if (category === "lineup") {
    if (!round) throw new Error("round is required for category=lineup");
    return nowSec >= k[round];
  }
  return nowSec >= k.firstMatchUtc;
}
