/**
 * Point values for each pick category. Tunable — edit and redeploy.
 *
 * Defaults bias toward "later rounds worth more" so the leaderboard moves
 * meaningfully throughout the tournament rather than being decided in the
 * group stage. Re-balance after the first test run if needed.
 */

export const RULES = {
  // Group stage — 24 picks per user
  GROUP_PICK_EXACT: 5,            // pick was 1st AND team finished 1st (same rank)
  GROUP_PICK_TOP2_WRONG_ORDER: 3, // pick was 1st but team finished 2nd (or vice versa)

  // Wildcards — 8 picks per user (best 3rds)
  WILDCARD_CORRECT: 5,            // picked team advances as one of 8 best 3rds

  // KO bracket — 31 picks per user (R32 .. Final)
  BRACKET_R32: 10,
  BRACKET_R16: 20,
  BRACKET_QF: 40,
  BRACKET_SF: 80,
  BRACKET_FINAL: 160,

  // Tournament-level — 3 picks per user
  TOURNAMENT_WINNER: 100,
  TOP_SCORER: 100,
  GOLDEN_GLOVE: 100,

  // Per-round lineup picks — 4 per round × 5 rounds (Day 12–13 lands UI;
  // scoring already supported here so we don't need to touch this file)
  LINEUP_GOAL: 10,
  LINEUP_ASSIST: 5,
  LINEUP_CLEAN_SHEET_GK: 10,
  LINEUP_CLEAN_SHEET_DEF: 5,
} as const;

/**
 * Approximate maximum per user (excluding lineup scoring):
 *   24 group × 5 + 8 wildcards × 5 + (16×10 + 8×20 + 4×40 + 2×80 + 160) + 3 × 100
 *   = 120 + 40 + 800 + 300
 *   = 1260
 */
export const MAX_TOURNAMENT_LEVEL_POINTS = 1260;
