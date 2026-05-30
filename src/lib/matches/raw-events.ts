import type { MatchEvent } from "@/lib/scoring/compute";

export type FotmobMatchStatRow = {
  title: string;
  key: string;
  stats: [unknown, unknown];
};

export type FotmobMatchStatGroup = {
  title: string;
  key: string;
  stats: FotmobMatchStatRow[];
};

export type FotmobMatchSnapshot = {
  matchId: string;
  sourceUrl: string;
  homeTeam: string;
  awayTeam: string;
  statusReason: string | null;
  stats: FotmobMatchStatGroup[];
  fetchedAt: number;
};

export type StoredMatchEvents =
  | MatchEvent[]
  | {
      events?: MatchEvent[];
      fotmob?: FotmobMatchSnapshot;
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMatchEvent(value: unknown): value is MatchEvent {
  if (!isRecord(value)) return false;
  return (
    (value.type === "goal" || value.type === "own_goal" || value.type === "assist") &&
    typeof value.playerId === "number" &&
    typeof value.teamId === "number"
  );
}

export function getMatchEvents(raw: unknown): MatchEvent[] {
  if (Array.isArray(raw)) return raw.filter(isMatchEvent);
  if (isRecord(raw) && Array.isArray(raw.events)) return raw.events.filter(isMatchEvent);
  return [];
}

export function getFotmobSnapshot(raw: unknown): FotmobMatchSnapshot | null {
  if (!isRecord(raw) || !isRecord(raw.fotmob)) return null;
  const snapshot = raw.fotmob;
  if (!Array.isArray(snapshot.stats)) return null;
  return snapshot as FotmobMatchSnapshot;
}
