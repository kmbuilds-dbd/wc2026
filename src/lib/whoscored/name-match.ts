/**
 * Match WhoScored team / player names to our internal IDs.
 *
 * WhoScored names are not always a 1:1 match to FIFA's canonical names —
 * e.g. "Czechia" vs "Czech Republic", "Bosnia and Herzegovina" vs
 * "Bosnia & Herzegovina". We normalize + apply a small alias table.
 *
 * For players, since WhoScored shows full names ("Roberto Piccoli") but our
 * squad data may use abbreviated or accented forms, we fall back to a
 * surname-only match scoped to the candidate's team.
 */
import { teamList, type UiTeam } from "@/lib/teams-data";
import { playerById, type UiPlayer } from "@/lib/players-data";

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip combining diacritics
    .replace(/&/g, "and")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const TEAM_ALIASES: Record<string, string> = {
  czechia: "czech republic",
  "bosnia and herzegovina": "bosnia and herzegovina", // matches both ours and WhoScored after normalize
  "korea republic": "south korea",
  "ivorycoast": "ivory coast",
  "cote divoire": "ivory coast",
  "united states": "usa",
  "united states of america": "usa",
  turkiye: "turkey",
  "the netherlands": "netherlands",
  "republic of ireland": "ireland",
};

const NORMALIZED_TEAMS: Array<{ team: UiTeam; norm: string }> = teamList.map(
  (t) => ({ team: t, norm: normalize(t.name) }),
);

export function resolveTeamId(whoscoredName: string): UiTeam | null {
  const norm = normalize(whoscoredName);
  const aliased = TEAM_ALIASES[norm] ?? norm;
  for (const { team, norm: n } of NORMALIZED_TEAMS) {
    if (n === aliased) return team;
  }
  return null;
}

/**
 * Match a WhoScored player name to a player_id, restricted to one team's
 * squad. Returns null if no confident match (caller can store the raw name
 * for admin reconciliation).
 *
 * Strategy:
 *   1. Exact normalized full-name match within team.
 *   2. Surname (last word) match within team — handles "R. Piccoli" → "Roberto Piccoli".
 *   3. Substring containment within team.
 */
export function resolvePlayerId(
  whoscoredName: string,
  teamId: number,
): UiPlayer | null {
  const norm = normalize(whoscoredName);
  const tokens = norm.split(" ").filter(Boolean);
  const surname = tokens[tokens.length - 1] ?? "";

  const candidates: UiPlayer[] = [];
  for (const p of playerById.values()) {
    if (p.teamId !== teamId) continue;
    candidates.push(p);
  }
  if (candidates.length === 0) return null;

  // 1) exact full-name normalized match
  for (const p of candidates) {
    if (normalize(p.name) === norm) return p;
  }

  // 2) surname-only — must be unique within team
  const surnameMatches = candidates.filter((p) => {
    const pTokens = normalize(p.name).split(" ").filter(Boolean);
    return pTokens[pTokens.length - 1] === surname;
  });
  if (surnameMatches.length === 1) return surnameMatches[0];

  // 3) substring — if WhoScored name contains the player's whole name or vice versa
  const subMatches = candidates.filter((p) => {
    const pn = normalize(p.name);
    return pn.includes(norm) || norm.includes(pn);
  });
  if (subMatches.length === 1) return subMatches[0];

  return null;
}
