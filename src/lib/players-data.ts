/**
 * Player list derived from the bundled tracker snapshot's squad arrays.
 *
 * The snapshot stores players as strings like "Harry Kane (Bayern Munich)"
 * with occasional ⚠ injury markers. We parse these into structured rows for
 * the top-scorer + golden-glove pick selectors.
 *
 * Synthetic player id is just a global sequence — stable so long as the
 * snapshot doesn't reorder. When real player IDs come from api-football we
 * remap by `name + team` join.
 */
import { trackerTeams } from "@/data/tracker-snapshot";

export type PlayerPosition = "GK" | "DEF" | "MID" | "FWD";

export interface UiPlayer {
  id: number;
  name: string;
  club: string | null;
  position: PlayerPosition;
  teamId: number; // synthetic team id (matches teams-data.ts)
  teamName: string;
  injured: boolean;
}

const positions: PlayerPosition[] = ["GK", "DEF", "MID", "FWD"];

function parsePlayerString(raw: string): { name: string; club: string | null; injured: boolean } {
  const injured = raw.includes("⚠");
  const cleaned = raw.replace(/⚠/g, "").trim();
  const m = cleaned.match(/^(.*?)\s*\(([^()]+)\)\s*$/);
  if (m) return { name: m[1].trim(), club: m[2].trim(), injured };
  return { name: cleaned, club: null, injured };
}

let _nextId = 1;
const _players: UiPlayer[] = [];

trackerTeams.forEach((t, teamIdx) => {
  const teamId = teamIdx + 1;
  for (const pos of positions) {
    for (const raw of t.sq[pos]) {
      if (!raw.trim()) continue;
      const parsed = parsePlayerString(raw);
      _players.push({
        id: _nextId++,
        position: pos,
        teamId,
        teamName: t.n,
        ...parsed,
      });
    }
  }
});

export const playerList: UiPlayer[] = _players;
export const playerById: Map<number, UiPlayer> = new Map(_players.map((p) => [p.id, p]));

export function playersForTeam(teamId: number): UiPlayer[] {
  return _players.filter((p) => p.teamId === teamId);
}

export function playersByPosition(pos: PlayerPosition): UiPlayer[] {
  return _players.filter((p) => p.position === pos);
}

/** All goalkeepers across all 48 teams. ~3 GKs/team × 48 teams = ~144 entries. */
export const allGoalkeepers: UiPlayer[] = playersByPosition("GK");
