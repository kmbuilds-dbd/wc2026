/**
 * Match external team/player names to our internal IDs.
 *
 * Source names are not always a 1:1 match to FIFA's canonical names, so we
 * normalize names and apply a small alias table before matching.
 */
import { teamList, type UiTeam } from "@/lib/teams-data";
import { playerById, type UiPlayer } from "@/lib/players-data";

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const TEAM_ALIASES: Record<string, string> = {
  czechia: "czech republic",
  "bosnia and herzegovina": "bosnia and herzegovina",
  "korea republic": "south korea",
  ivorycoast: "ivory coast",
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

export function resolveTeamId(sourceName: string): UiTeam | null {
  const norm = normalize(sourceName);
  const aliased = TEAM_ALIASES[norm] ?? norm;
  for (const { team, norm: n } of NORMALIZED_TEAMS) {
    if (n === aliased) return team;
  }
  return null;
}

export function resolvePlayerId(sourceName: string, teamId: number): UiPlayer | null {
  const norm = normalize(sourceName);
  const tokens = norm.split(" ").filter(Boolean);
  const surname = tokens[tokens.length - 1] ?? "";

  const candidates = Array.from(playerById.values()).filter((p) => p.teamId === teamId);
  if (candidates.length === 0) return null;

  for (const p of candidates) {
    if (normalize(p.name) === norm) return p;
  }

  const surnameMatches = candidates.filter((p) => {
    const pTokens = normalize(p.name).split(" ").filter(Boolean);
    return pTokens[pTokens.length - 1] === surname;
  });
  if (surnameMatches.length === 1) return surnameMatches[0];

  const subMatches = candidates.filter((p) => {
    const pn = normalize(p.name);
    return pn.includes(norm) || norm.includes(pn);
  });
  if (subMatches.length === 1) return subMatches[0];

  return null;
}
