/**
 * "Alive teams per round" — which teams are eligible for lineup picks at
 * each KO round, derived from recorded match results.
 *
 * Pre-data fallback: all 48 teams. Once group stage ends, R32 alive set
 * narrows to top-2-per-group + 8 wildcards (24 teams). Once R32 plays out,
 * R16 alive = winners of R32 (16). And so on.
 *
 * The user can refine lineup picks as the tournament progresses (subject to
 * each round's lock deadline). A previously-picked player whose team gets
 * knocked out simply stops scoring — no refund per grilling Q7.
 */
import { computeActuals, type Actuals } from "./compute";
import type { Match } from "@/db/schema";
import type { LineupRound } from "@/lib/locks";
import { teamList } from "@/lib/teams-data";

export const ALL_TEAM_IDS: Set<number> = new Set(teamList.map((t) => t.id));

/**
 * Returns the set of team_ids whose players the user may pick for the given
 * round's lineup. Pre-data → all 48; once data exists → narrowed.
 */
export function computeAliveTeams(
  round: LineupRound,
  actuals: Actuals,
): Set<number> {
  switch (round) {
    case "group":
      // Group stage: all 48 teams are eligible — every team plays 3 matchdays.
      return ALL_TEAM_IDS;
    case "r32": {
      const advancing = new Set<number>();
      // top-2 per group
      for (const standing of Object.values(actuals.groupStandings)) {
        if (standing[0] != null) advancing.add(standing[0]);
        if (standing[1] != null) advancing.add(standing[1]);
      }
      // 8 best 3rd-place teams
      for (const t of actuals.wildcardAdvancers) advancing.add(t);
      // Fallback: if group standings empty, all 48
      return advancing.size > 0 ? advancing : ALL_TEAM_IDS;
    }
    case "r16":
      return actuals.winnersByRound.r32.size > 0
        ? new Set(actuals.winnersByRound.r32)
        : computeAliveTeams("r32", actuals);
    case "qf":
      return actuals.winnersByRound.r16.size > 0
        ? new Set(actuals.winnersByRound.r16)
        : computeAliveTeams("r16", actuals);
    case "sf":
      return actuals.winnersByRound.qf.size > 0
        ? new Set(actuals.winnersByRound.qf)
        : computeAliveTeams("qf", actuals);
    case "final":
      return actuals.winnersByRound.sf.size > 0
        ? new Set(actuals.winnersByRound.sf)
        : computeAliveTeams("sf", actuals);
  }
}

/** Convenience wrapper for callers that don't already have Actuals. */
export function computeAliveTeamsFromMatches(
  round: LineupRound,
  matches: Match[],
): Set<number> {
  return computeAliveTeams(round, computeActuals(matches));
}
