/**
 * Team list derived from the bundled tracker snapshot.
 *
 * Each team gets a deterministic synthetic id = (index+1) in the snapshot
 * array. This is the same id we seed into the D1 `teams` table via
 * seedTeamsFromSnapshot, so picks (group_picks.team_id, bracket_picks.team_id,
 * etc.) reference these stable values.
 *
 * When/if we later switch to api-football for the real source-of-truth, we
 * either remap the ids (picks were locked at Jun 11 kickoff anyway, so it's
 * safe to drop+re-seed) or keep the synthetic ids and join on team name.
 */
import { trackerTeams, type TrackerTeam } from "@/data/tracker-snapshot";

export interface UiTeam {
  id: number;
  name: string;
  flag: string;
  groupLetter: string;
  coach: string;
}

/** All 48 teams with synthetic IDs (1..48). Same ordering as the snapshot. */
export const teamList: UiTeam[] = trackerTeams.map((t, i) => ({
  id: i + 1,
  name: t.n,
  flag: t.f,
  groupLetter: t.g,
  coach: t.c,
}));

export const teamById: Map<number, UiTeam> = new Map(teamList.map((t) => [t.id, t]));
export const teamByName: Map<string, UiTeam> = new Map(
  teamList.map((t) => [t.name.toLowerCase(), t]),
);

/** Teams in a given group letter, in snapshot order (typically matches FIFA draw order). */
export function teamsInGroup(letter: string): UiTeam[] {
  return teamList.filter((t) => t.groupLetter === letter);
}

/** Distinct group letters in alphabetical order (A..L). */
export const groupLetters: string[] = Array.from(
  new Set(teamList.map((t) => t.groupLetter)),
).sort();

/** The raw tracker entry for a synthetic id, if you need squad/omissions etc. */
export function trackerEntry(id: number): TrackerTeam | undefined {
  return trackerTeams[id - 1];
}
