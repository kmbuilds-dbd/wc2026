/**
 * Pick-lock model.
 *
 * Tournament-level picks (groups, wildcards, KO bracket, top scorer, golden
 * glove, winner) lock at the kickoff of the first WC match.
 *
 * Per-round lineup picks open after the previous round's last match ends and
 * lock at the first kickoff of that round.
 *
 * Single source of truth — every write path (server actions, route handlers)
 * MUST call `isLocked(category, round?)` before mutating.
 */

// Jun 11, 2026 20:00 UTC — South Korea vs Czech Republic kickoff, the
// scheduled opener per teams.json `fg` strings. Verified at impl time
// against api-sports `/fixtures?league=1&season=2026&first=1`.
// TODO: replace with a query against `matches.kickoff_utc WHERE stage='group'
// ORDER BY kickoff_utc ASC LIMIT 1` once fixtures are seeded.
export const FIRST_KICKOFF_UTC = 1749672000;

export type PickCategory =
  | "group"
  | "wildcard"
  | "bracket"
  | "tournament"
  | "lineup";

export type LineupRound = "r32" | "r16" | "qf" | "sf" | "final";

/**
 * Returns true if the given category (and round, for lineups) is locked
 * for the current request.
 */
export function isLocked(
  category: PickCategory,
  round?: LineupRound,
): boolean {
  const nowSec = Math.floor(Date.now() / 1000);
  if (category === "lineup") {
    if (!round) {
      throw new Error("round is required for category=lineup");
    }
    return nowSec >= roundFirstKickoffUtc(round);
  }
  return nowSec >= FIRST_KICKOFF_UTC;
}

/**
 * Placeholder per-round first-kickoff schedule. Replace at impl time with a
 * D1 query: `SELECT MIN(kickoff_utc) FROM matches WHERE stage = ?`.
 */
export function roundFirstKickoffUtc(round: LineupRound): number {
  // Approximate FIFA WC2026 schedule based on the bracket template.
  // Group stage ends Jun 27 → R32 starts Jun 28 → R16 Jul 4 → QF Jul 9 → SF Jul 14 → Final Jul 19.
  const schedule: Record<LineupRound, number> = {
    r32: 1751155200, // Jun 28 2026 20:00 UTC (approx)
    r16: 1751673600, // Jul 4 2026 20:00 UTC (approx)
    qf: 1752105600, // Jul 9 2026 20:00 UTC (approx)
    sf: 1752537600, // Jul 14 2026 20:00 UTC (approx)
    final: 1752969600, // Jul 19 2026 20:00 UTC (approx)
  };
  return schedule[round];
}
