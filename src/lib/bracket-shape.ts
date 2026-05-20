/**
 * WC 2026 knockout-bracket slot definitions.
 *
 * Per grilling Q4 the user picks 31 KO winners: 16 R32 + 8 R16 + 4 QF + 2 SF
 * + 1 Final. (3rd-place playoff excluded.)
 *
 * For v1 we identify slots by string labels (e.g. "r32-1", "r16-3", "final")
 * without committing to a specific FIFA bracket-template pairing — picks are
 * "which team wins this slot" rather than "which team wins this matchup",
 * so we don't need to resolve seedings here. When we eventually wire actual
 * fixtures, the bracket page can show the resolved pairing per slot.
 */

export type BracketRound = "r32" | "r16" | "qf" | "sf" | "final";

export interface BracketSlot {
  slot: string; // 'r32-1' .. 'final'
  round: BracketRound;
  position: number; // 1..16 within round
  label: string; // 'R32 #1' .. 'Final'
}

const COUNTS: Record<BracketRound, number> = {
  r32: 16,
  r16: 8,
  qf: 4,
  sf: 2,
  final: 1,
};

export const ROUND_LABEL: Record<BracketRound, string> = {
  r32: "Round of 32",
  r16: "Round of 16",
  qf: "Quarter-finals",
  sf: "Semi-finals",
  final: "Final",
};

export const BRACKET_SLOTS: BracketSlot[] = (
  ["r32", "r16", "qf", "sf", "final"] as const
).flatMap((round) => {
  const count = COUNTS[round];
  return Array.from({ length: count }, (_, i) => ({
    slot: count === 1 ? round : `${round}-${i + 1}`,
    round,
    position: i + 1,
    label: count === 1 ? ROUND_LABEL[round] : `${ROUND_LABEL[round]} #${i + 1}`,
  }));
});

/** Slots filtered by round, for grouped UI rendering. */
export function slotsByRound(): Array<{ round: BracketRound; slots: BracketSlot[] }> {
  return (["r32", "r16", "qf", "sf", "final"] as const).map((round) => ({
    round,
    slots: BRACKET_SLOTS.filter((s) => s.round === round),
  }));
}

export function isValidSlot(slot: string): boolean {
  return BRACKET_SLOTS.some((s) => s.slot === slot);
}

/** Total = 16 + 8 + 4 + 2 + 1 = 31. */
export const BRACKET_SLOT_COUNT: number = BRACKET_SLOTS.length;
