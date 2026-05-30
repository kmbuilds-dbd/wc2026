/**
 * Point values for each pick category. Tunable — edit and redeploy.
 *
 * Knockout picks are made round-by-round, so a correct team pick is worth
 * the same amount at every stage.
 */

export const RULES = {
  // Group stage — 24 picks per user
  GROUP_PICK_EXACT: 8,            // pick was 1st AND team finished 1st (same rank)
  GROUP_PICK_TOP2_WRONG_ORDER: 3, // pick was 1st but team finished 2nd (or vice versa)

  // Wildcards — 8 picks per user (best 3rds)
  WILDCARD_CORRECT: 8,            // picked team advances as one of 8 best 3rds

  // KO bracket — 31 picks per user (R32..Final), made one stage at a time.
  BRACKET_R32: 8,
  BRACKET_R16: 8,
  BRACKET_QF: 8,
  BRACKET_SF: 8,
  BRACKET_FINAL: 8,

  // Tournament-level — 3 picks per user. Winner pick gets partial credit
  // if that team reaches the final but loses.
  TOURNAMENT_WINNER: 50,          // winner pick matched the champion
  TOURNAMENT_FINALIST: 20,        // winner pick matched the team that lost the final
  TOP_SCORER: 50,
  GOLDEN_GLOVE: 50,

  // Per-round lineup picks — 4 per round × 5 knockout rounds
  LINEUP_GOAL: 10,
  LINEUP_ASSIST: 5,
  LINEUP_CLEAN_SHEET_GK: 10,
  LINEUP_CLEAN_SHEET_DEF: 5,
} as const;

/**
 * Approximate maximum per user (excluding lineup scoring):
 *   24 × 8 + 8 × 8 + 31 × 8 + (50 + 50 + 50)
 *   = 192 + 64 + 248 + 150
 *   = 654
 */
export const MAX_TOURNAMENT_LEVEL_POINTS = 654;
