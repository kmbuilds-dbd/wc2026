/**
 * Point values for each pick category. Tunable — edit and redeploy.
 *
 * Defaults bias toward "later rounds worth more" so the leaderboard moves
 * meaningfully throughout the tournament rather than being decided in the
 * group stage. Re-balance after the first test run if needed.
 */

export const RULES = {
  // Group stage — 24 picks per user
  GROUP_PICK_EXACT: 8,            // pick was 1st AND team finished 1st (same rank)
  GROUP_PICK_TOP2_WRONG_ORDER: 3, // pick was 1st but team finished 2nd (or vice versa)

  // Wildcards — 8 picks per user (best 3rds)
  WILDCARD_CORRECT: 5,            // picked team advances as one of 8 best 3rds

  // KO bracket — 31 picks per user (R32..Final). Flattened from
  // 10/20/40/80/160 so the winner-chain bonus (now 210) doesn't drown
  // out the rest of the scoreboard.
  BRACKET_R32: 10,
  BRACKET_R16: 20,
  BRACKET_QF: 40,
  BRACKET_SF: 60,
  BRACKET_FINAL: 80,

  // Tournament-level — 3 picks per user. Winner pick splits into two tiers
  // so picking the losing finalist still scores.
  TOURNAMENT_WINNER: 50,          // winner pick matched the champion
  TOURNAMENT_FINALIST: 50,        // winner pick matched the team that lost the final
  TOP_SCORER: 100,
  GOLDEN_GLOVE: 100,

  // Per-round lineup picks — 4 per round × 6 rounds (group + 5 KO)
  LINEUP_GOAL: 15,
  LINEUP_ASSIST: 8,
  LINEUP_CLEAN_SHEET_GK: 10,
  LINEUP_CLEAN_SHEET_DEF: 5,
} as const;

/**
 * Approximate maximum per user (excluding lineup scoring):
 *   24 × 8 + 8 × 5 + (16×10 + 8×20 + 4×40 + 2×60 + 80) + (50 + 100 + 100)
 *   = 192 + 40 + 600 + 250
 *   = 1082
 *
 * Winner-pick lever is now 50 (winner) + 210 (bracket chain 10+20+40+60+80) = 260,
 * down from 410 under the original 100 + 310 chain. ~37% reduction.
 */
export const MAX_TOURNAMENT_LEVEL_POINTS = 1082;
