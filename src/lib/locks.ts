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
 * Using Date.UTC() rather than hardcoded integers so the dates are obvious
 * at a glance and we can't silently introduce off-by-year mistakes.
 * (`Date.UTC(2026, 5, 11, 20)` = Jun 11 2026 20:00 UTC — month is 0-indexed.)
 */
function utc(year: number, month1: number, day: number, hour = 20): number {
  // month1 is 1-indexed here so calls read naturally (utc(2026, 6, 11) = Jun 11).
  return Math.floor(Date.UTC(year, month1 - 1, day, hour, 0, 0) / 1000);
}

export const FALLBACK_KICKOFFS = {
  firstMatchUtc: utc(2026, 6, 11), // Group stage opener
  r32: utc(2026, 6, 28),
  r16: utc(2026, 7, 4),
  qf: utc(2026, 7, 9),
  sf: utc(2026, 7, 14),
  final: utc(2026, 7, 19),
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
