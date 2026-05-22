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

export type LineupRound = "group" | "r32" | "r16" | "qf" | "sf" | "final";

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
  bracketOpensAt: utc(2026, 6, 28, 0), // Midnight UTC the day R32 starts — group stage is over
  r32: utc(2026, 6, 28),
  r16: utc(2026, 7, 4),
  qf: utc(2026, 7, 9),
  sf: utc(2026, 7, 14),
  final: utc(2026, 7, 19),
  // KO lineup opens-at: midnight UTC the day the round starts. Gives users
  // the window between the previous round's last match and this round's
  // first kickoff to set their lineup with alive teams known.
  lineupOpensAt: {
    r32: utc(2026, 6, 28, 0),
    r16: utc(2026, 7, 4, 0),
    qf: utc(2026, 7, 9, 0),
    sf: utc(2026, 7, 14, 0),
    final: utc(2026, 7, 19, 0),
  },
} as const;

/** Backwards-compatible export for the dashboard countdown. */
export const FIRST_KICKOFF_UTC = FALLBACK_KICKOFFS.firstMatchUtc;

export type KoRound = Exclude<LineupRound, "group">;

export interface Kickoffs {
  firstMatchUtc: number;
  bracketOpensAt: number;
  group: number;
  r32: number;
  r16: number;
  qf: number;
  sf: number;
  final: number;
  lineupOpensAt: Record<KoRound, number>;
}

/**
 * Resolve kickoff timestamps, preferring D1 values when available.
 * Falls back to FALLBACK_KICKOFFS for any stage that hasn't been seeded.
 */
export async function getKickoffs(): Promise<Kickoffs> {
  const fromDb = await getStageKickoffs();
  const groupKickoff = fromDb.group ?? FALLBACK_KICKOFFS.firstMatchUtc;
  return {
    firstMatchUtc: groupKickoff,
    bracketOpensAt: FALLBACK_KICKOFFS.bracketOpensAt,
    group: groupKickoff,
    r32: fromDb.r32 ?? FALLBACK_KICKOFFS.r32,
    r16: fromDb.r16 ?? FALLBACK_KICKOFFS.r16,
    qf: fromDb.qf ?? FALLBACK_KICKOFFS.qf,
    sf: fromDb.sf ?? FALLBACK_KICKOFFS.sf,
    final: fromDb.final ?? FALLBACK_KICKOFFS.final,
    lineupOpensAt: { ...FALLBACK_KICKOFFS.lineupOpensAt },
  };
}

export type PickWindowState = "pending" | "open" | "locked";

export interface PickWindow {
  state: PickWindowState;
  /** Unix seconds when `pending` → `open`. For categories with no pending state, this is 0. */
  opensAt: number;
  /** Unix seconds when `open` → `locked`. */
  lockAt: number;
}

// Back-compat aliases (legacy callers).
export type BracketState = PickWindowState;
export type BracketWindow = PickWindow;

/**
 * Bracket has a three-state lifecycle because picks require knowing the KO
 * matchups, which are only resolved after group stage ends:
 *   pending → before bracketOpensAt
 *   open    → between bracketOpensAt and r32 first kickoff
 *   locked  → at or after r32 first kickoff
 */
export async function getBracketWindow(): Promise<PickWindow> {
  const k = await getKickoffs();
  const nowSec = Math.floor(Date.now() / 1000);
  const state: PickWindowState =
    nowSec < k.bracketOpensAt ? "pending" : nowSec >= k.r32 ? "locked" : "open";
  return { state, opensAt: k.bracketOpensAt, lockAt: k.r32 };
}

/**
 * Lineup window per round. KO rounds have a pending state because alive teams
 * aren't decided until the previous round finishes. Group has no pending
 * state (no prior round to wait on).
 */
export async function getLineupWindow(round: LineupRound): Promise<PickWindow> {
  const k = await getKickoffs();
  const nowSec = Math.floor(Date.now() / 1000);
  if (round === "group") {
    return {
      state: nowSec >= k.group ? "locked" : "open",
      opensAt: 0,
      lockAt: k.group,
    };
  }
  const opensAt = k.lineupOpensAt[round];
  const lockAt = k[round];
  const state: PickWindowState =
    nowSec < opensAt ? "pending" : nowSec >= lockAt ? "locked" : "open";
  return { state, opensAt, lockAt };
}

export async function isLocked(
  category: PickCategory,
  round?: LineupRound,
): Promise<boolean> {
  const k = await getKickoffs();
  const nowSec = Math.floor(Date.now() / 1000);
  if (category === "lineup") {
    if (!round) throw new Error("round is required for category=lineup");
    if (round === "group") return nowSec >= k.group;
    return nowSec < k.lineupOpensAt[round] || nowSec >= k[round];
  }
  if (category === "bracket") {
    return nowSec < k.bracketOpensAt || nowSec >= k.r32;
  }
  return nowSec >= k.firstMatchUtc;
}
