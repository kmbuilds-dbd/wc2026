import { BRACKET_SLOTS, type BracketRound } from "@/lib/bracket-shape";

export interface BracketMatchup {
  slot: string;
  matchId: number;
  kickoffUtc: number;
  homeTeamId: number | null;
  awayTeamId: number | null;
}

type MatchupInput = {
  id: number;
  stage: "group" | BracketRound | "3p";
  kickoffUtc: number;
  homeTeamId: number | null;
  awayTeamId: number | null;
};

const BRACKET_ROUNDS: BracketRound[] = ["r32", "r16", "qf", "sf", "final"];

export function buildBracketMatchups(matches: MatchupInput[]): BracketMatchup[] {
  const out: BracketMatchup[] = [];

  for (const round of BRACKET_ROUNDS) {
    const roundMatches = matches
      .filter((m) => m.stage === round)
      .sort((a, b) => a.kickoffUtc - b.kickoffUtc || a.id - b.id);
    const slots = BRACKET_SLOTS.filter((s) => s.round === round);

    for (let i = 0; i < roundMatches.length && i < slots.length; i++) {
      const match = roundMatches[i];
      const slot = slots[i];
      out.push({
        slot: slot.slot,
        matchId: match.id,
        kickoffUtc: match.kickoffUtc,
        homeTeamId: match.homeTeamId,
        awayTeamId: match.awayTeamId,
      });
    }
  }

  return out;
}
