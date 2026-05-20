/**
 * Typed accessor over the squad-tracker JSON snapshot copied from
 * wc2026_worker/teams.json on 2026-05-19.
 *
 * Source-of-truth shape (compact keys from the original tracker):
 *   g  = group letter (A..L)
 *   n  = team name
 *   f  = flag emoji
 *   c  = head coach
 *   s  = status ('confirmed' | 'preliminary' | 'pending')
 *   sl = status label (free-form, e.g. "Confirmed · May 18")
 *   fg = first-game string (e.g. "Jun 11 v South Africa")
 *   note = optional editorial note
 *   sq = squad object { GK, DEF, MID, FWD: string[] of "Player (Club)" }
 *   om = omissions [{ n: name, r: reason }]
 */
import snapshot from "./tracker-snapshot.json" with { type: "json" };

export type SquadStatus = "confirmed" | "preliminary" | "pending";

export interface TrackerTeam {
  g: string;
  n: string;
  f: string;
  c: string;
  s: SquadStatus;
  sl: string;
  fg: string;
  note: string | null;
  sq: {
    GK: string[];
    DEF: string[];
    MID: string[];
    FWD: string[];
  };
  om: Array<{ n: string; r: string }>;
}

export const trackerTeams: TrackerTeam[] = snapshot as TrackerTeam[];

/**
 * Index by lowercased name for quick lookup when enriching api-sports
 * team rows with squad data.
 */
export const trackerByName: Map<string, TrackerTeam> = new Map(
  trackerTeams.map((t) => [t.n.toLowerCase().trim(), t]),
);
