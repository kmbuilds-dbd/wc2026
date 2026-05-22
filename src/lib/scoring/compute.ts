/**
 * Pure scoring functions. Take picks + match results in, return Score rows.
 *
 * No I/O — apply.ts handles DB reads/writes. This lets us unit-test scoring
 * by passing fake input later (Day 18-19 E2E).
 *
 * Lineup scoring is stubbed; UI lands in Day 12-13.
 */
import { RULES } from "./rules";
import { BRACKET_SLOTS, type BracketRound } from "@/lib/bracket-shape";
import type { LineupRound } from "@/lib/locks";
import type {
  GroupPick,
  WildcardPick,
  BracketPick,
  TournamentPick,
  LineupPick,
  Match,
  User,
} from "@/db/schema";

// ─── Raw event shape stored in matches.raw_events JSON column ────────────

export interface MatchGoalEvent {
  type: "goal" | "own_goal";
  playerId: number;
  teamId: number;
  minute?: number;
}
export interface MatchAssistEvent {
  type: "assist";
  playerId: number;
  teamId: number;
  minute?: number;
}
export type MatchEvent = MatchGoalEvent | MatchAssistEvent;

// ─── Score row (matches schema.scores) ──────────────────────────────────

export interface ScoreRow {
  userEmail: string;
  category: string;
  key: string;
  points: number;
  computedAt: number;
}

// ─── Computed "actuals" — derived once, used to score every user ────────

export interface Actuals {
  /** Per group letter (A..L) → team_ids in finishing order (1st, 2nd, 3rd, 4th). */
  groupStandings: Record<string, number[]>;
  /** team_ids of the 8 best 3rd-place teams. */
  wildcardAdvancers: Set<number>;
  /** Per KO round → set of team_ids that won at least one match in that round. */
  winnersByRound: Record<BracketRound, Set<number>>;
  /** Champion team_id (winner of stage='final'). */
  champion: number | null;
  /** Set of player_ids tied for most goals. */
  topScorerPlayerIds: Set<number>;
  /** Set of team_ids tied for most clean sheets (used for golden glove). */
  goldenGloveTeamIds: Set<number>;
}

interface TeamStanding {
  teamId: number;
  played: number;
  pts: number;
  gd: number;
  gf: number;
  ga: number;
}

function emptyStanding(teamId: number): TeamStanding {
  return { teamId, played: 0, pts: 0, gd: 0, gf: 0, ga: 0 };
}

/**
 * Apply a single finished match's result to a map of standings.
 * Used by both group standings and (later) head-to-head tiebreakers.
 */
function applyMatch(
  standings: Map<number, TeamStanding>,
  m: Match,
): void {
  if (
    m.homeTeamId == null ||
    m.awayTeamId == null ||
    m.homeScore == null ||
    m.awayScore == null
  ) return;
  const h = standings.get(m.homeTeamId) ?? emptyStanding(m.homeTeamId);
  const a = standings.get(m.awayTeamId) ?? emptyStanding(m.awayTeamId);
  h.played++; a.played++;
  h.gf += m.homeScore; a.gf += m.awayScore;
  h.ga += m.awayScore; a.ga += m.homeScore;
  h.gd = h.gf - h.ga; a.gd = a.gf - a.ga;
  if (m.homeScore > m.awayScore) h.pts += 3;
  else if (m.homeScore < m.awayScore) a.pts += 3;
  else { h.pts += 1; a.pts += 1; }
  standings.set(m.homeTeamId, h);
  standings.set(m.awayTeamId, a);
}

function sortStandings(rows: TeamStanding[]): TeamStanding[] {
  // pts desc, gd desc, gf desc — head-to-head omitted in v1; ties rare and
  // admin-resolvable via direct D1 manipulation.
  return [...rows].sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf);
}

/**
 * Compute group standings and KO winners and tournament champion etc. from
 * the matches array. Only finished matches contribute. Returns "as of now"
 * — picks score on whatever's been recorded.
 */
export function computeActuals(matches: Match[]): Actuals {
  const finished = matches.filter((m) => m.status === "finished");

  // 1. Group standings
  const byGroup: Record<string, TeamStanding[]> = {};
  const groupedMatches = finished.filter((m) => m.stage === "group");
  for (const m of groupedMatches) {
    if (!m.groupLetter) continue;
    const s = byGroup[m.groupLetter] ?? [];
    // Use a Map so we can accumulate, then dump to array.
    const map = new Map(s.map((t) => [t.teamId, t]));
    applyMatch(map, m);
    byGroup[m.groupLetter] = Array.from(map.values());
  }
  const groupStandings: Record<string, number[]> = {};
  for (const [letter, rows] of Object.entries(byGroup)) {
    groupStandings[letter] = sortStandings(rows).map((r) => r.teamId);
  }

  // 2. Wildcard advancers — top 8 of the 12 third-place teams.
  const thirdPlaceStandings: TeamStanding[] = [];
  for (const [, rows] of Object.entries(byGroup)) {
    const sorted = sortStandings(rows);
    if (sorted.length >= 3) thirdPlaceStandings.push(sorted[2]);
  }
  const wildcardAdvancers = new Set(
    sortStandings(thirdPlaceStandings).slice(0, 8).map((r) => r.teamId),
  );

  // 3. KO winners per round.
  const winnersByRound: Record<BracketRound, Set<number>> = {
    r32: new Set(), r16: new Set(), qf: new Set(), sf: new Set(), final: new Set(),
  };
  for (const m of finished) {
    if (m.stage === "group" || m.stage === "3p") continue;
    const stage = m.stage as BracketRound;
    if (!(stage in winnersByRound)) continue;
    if (m.homeScore == null || m.awayScore == null) continue;
    const winner =
      m.homeScore > m.awayScore
        ? m.homeTeamId
        : m.awayScore > m.homeScore
          ? m.awayTeamId
          : null; // ties shouldn't happen in KO; for v1 we ignore them (admin records penalty-shootout winner via a follow-up event type)
    if (winner != null) winnersByRound[stage].add(winner);
  }

  // 4. Champion = winner of the Final.
  const champion = [...winnersByRound.final][0] ?? null;

  // 5. Top scorer (player_ids tied for most goals).
  const goalsByPlayer: Map<number, number> = new Map();
  for (const m of finished) {
    const events = (m.rawEvents as MatchEvent[] | null) ?? [];
    for (const ev of events) {
      if (ev.type === "goal") {
        goalsByPlayer.set(ev.playerId, (goalsByPlayer.get(ev.playerId) ?? 0) + 1);
      }
    }
  }
  let topScorerPlayerIds: Set<number> = new Set();
  if (goalsByPlayer.size > 0) {
    const maxGoals = Math.max(...goalsByPlayer.values());
    topScorerPlayerIds = new Set(
      Array.from(goalsByPlayer.entries())
        .filter(([, g]) => g === maxGoals)
        .map(([id]) => id),
    );
  }

  // 6. Golden Glove (team_ids tied for most clean sheets).
  const cleanSheetsByTeam: Map<number, number> = new Map();
  for (const m of finished) {
    if (m.homeScore == null || m.awayScore == null) continue;
    if (m.awayScore === 0 && m.homeTeamId != null) {
      cleanSheetsByTeam.set(
        m.homeTeamId,
        (cleanSheetsByTeam.get(m.homeTeamId) ?? 0) + 1,
      );
    }
    if (m.homeScore === 0 && m.awayTeamId != null) {
      cleanSheetsByTeam.set(
        m.awayTeamId,
        (cleanSheetsByTeam.get(m.awayTeamId) ?? 0) + 1,
      );
    }
  }
  let goldenGloveTeamIds: Set<number> = new Set();
  if (cleanSheetsByTeam.size > 0) {
    const maxCs = Math.max(...cleanSheetsByTeam.values());
    goldenGloveTeamIds = new Set(
      Array.from(cleanSheetsByTeam.entries())
        .filter(([, cs]) => cs === maxCs)
        .map(([id]) => id),
    );
  }

  return {
    groupStandings,
    wildcardAdvancers,
    winnersByRound,
    champion,
    topScorerPlayerIds,
    goldenGloveTeamIds,
  };
}

// ─── Per-user scoring ───────────────────────────────────────────────────

function scoreGroups(
  user: User,
  picks: GroupPick[],
  actual: Actuals,
  now: number,
): ScoreRow[] {
  const rows: ScoreRow[] = [];
  for (const p of picks) {
    if (p.userEmail !== user.email) continue;
    const standing = actual.groupStandings[p.groupLetter];
    if (!standing || standing.length < 2) continue;
    const actualAtRank = standing[p.rank - 1]; // rank 1 -> idx 0, rank 2 -> idx 1
    const otherRank = standing[p.rank === 1 ? 1 : 0];
    let pts = 0;
    if (actualAtRank === p.teamId) pts = RULES.GROUP_PICK_EXACT;
    else if (otherRank === p.teamId) pts = RULES.GROUP_PICK_TOP2_WRONG_ORDER;
    rows.push({
      userEmail: user.email,
      category: "group",
      key: `group:${p.groupLetter}:${p.rank}`,
      points: pts,
      computedAt: now,
    });
  }
  return rows;
}

function scoreWildcards(
  user: User,
  picks: WildcardPick[],
  actual: Actuals,
  now: number,
): ScoreRow[] {
  return picks
    .filter((p) => p.userEmail === user.email)
    .map((p) => ({
      userEmail: user.email,
      category: "wildcard",
      key: `wildcard:${p.slot}`,
      points: actual.wildcardAdvancers.has(p.teamId) ? RULES.WILDCARD_CORRECT : 0,
      computedAt: now,
    }));
}

function bracketSlotPoints(slot: string): number {
  const round = BRACKET_SLOTS.find((s) => s.slot === slot)?.round;
  switch (round) {
    case "r32": return RULES.BRACKET_R32;
    case "r16": return RULES.BRACKET_R16;
    case "qf":  return RULES.BRACKET_QF;
    case "sf":  return RULES.BRACKET_SF;
    case "final": return RULES.BRACKET_FINAL;
    default: return 0;
  }
}

function scoreBracket(
  user: User,
  picks: BracketPick[],
  actual: Actuals,
  now: number,
): ScoreRow[] {
  // Pick scores if the picked team won ANY match in that round (slot-agnostic
  // — see "Bracket scoring" note in src/lib/scoring/README or progress.md).
  // Dedupe: same team picked for two slots in the same round only scores once.
  const userPicks = picks.filter((p) => p.userEmail === user.email);
  const creditedPerRound = new Map<BracketRound, Set<number>>();
  const rows: ScoreRow[] = [];

  for (const p of userPicks) {
    const slotInfo = BRACKET_SLOTS.find((s) => s.slot === p.matchSlot);
    if (!slotInfo) continue;
    const round = slotInfo.round;
    const won = actual.winnersByRound[round]?.has(p.teamId) ?? false;
    let pts = 0;
    if (won) {
      const credited = creditedPerRound.get(round) ?? new Set<number>();
      if (!credited.has(p.teamId)) {
        pts = bracketSlotPoints(p.matchSlot);
        credited.add(p.teamId);
        creditedPerRound.set(round, credited);
      }
    }
    rows.push({
      userEmail: user.email,
      category: "bracket",
      key: `bracket:${p.matchSlot}`,
      points: pts,
      computedAt: now,
    });
  }
  return rows;
}

function scoreTournament(
  user: User,
  pick: TournamentPick | undefined,
  actual: Actuals,
  playerTeamById: Map<number, number>,
  now: number,
): ScoreRow[] {
  if (!pick) return [];
  const rows: ScoreRow[] = [];

  // Winner
  if (pick.winnerTeamId != null && actual.champion != null) {
    rows.push({
      userEmail: user.email,
      category: "tournament",
      key: "tournament:winner",
      points: pick.winnerTeamId === actual.champion ? RULES.TOURNAMENT_WINNER : 0,
      computedAt: now,
    });
  }

  // Top scorer (player id)
  if (pick.topScorerPlayerId != null && actual.topScorerPlayerIds.size > 0) {
    rows.push({
      userEmail: user.email,
      category: "tournament",
      key: "tournament:top_scorer",
      points: actual.topScorerPlayerIds.has(pick.topScorerPlayerId)
        ? RULES.TOP_SCORER
        : 0,
      computedAt: now,
    });
  }

  // Golden Glove — pick is a player id; we award if their team had the most
  // clean sheets (any GK of the leading team counts; see compute notes).
  if (pick.goldenGlovePlayerId != null && actual.goldenGloveTeamIds.size > 0) {
    const playerTeam = playerTeamById.get(pick.goldenGlovePlayerId);
    rows.push({
      userEmail: user.email,
      category: "tournament",
      key: "tournament:golden_glove",
      points:
        playerTeam != null && actual.goldenGloveTeamIds.has(playerTeam)
          ? RULES.GOLDEN_GLOVE
          : 0,
      computedAt: now,
    });
  }

  return rows;
}

// ─── Lineup scoring ─────────────────────────────────────────────────────

const LINEUP_ROUNDS: LineupRound[] = ["group", "r32", "r16", "qf", "sf", "final"];

interface PlayerStatLookup {
  /** player_id → team_id */
  playerTeam: Map<number, number>;
  /** player_id → position */
  playerPosition: Map<number, "GK" | "DEF" | "MID" | "FWD">;
}

/**
 * For a given round's finished matches, tally per-player goals + assists
 * and per-team clean sheets. Result is round-scoped — knockout-stage scoring
 * doesn't bleed into other rounds even if the player appears in both.
 */
function tallyRoundStats(roundMatches: Match[]): {
  goalsByPlayer: Map<number, number>;
  assistsByPlayer: Map<number, number>;
  cleanSheetsByTeam: Map<number, number>;
} {
  const goalsByPlayer = new Map<number, number>();
  const assistsByPlayer = new Map<number, number>();
  const cleanSheetsByTeam = new Map<number, number>();

  for (const m of roundMatches) {
    if (m.status !== "finished") continue;
    if (m.homeScore == null || m.awayScore == null) continue;

    // Clean sheets — credit the team that conceded zero.
    if (m.awayScore === 0 && m.homeTeamId != null) {
      cleanSheetsByTeam.set(
        m.homeTeamId,
        (cleanSheetsByTeam.get(m.homeTeamId) ?? 0) + 1,
      );
    }
    if (m.homeScore === 0 && m.awayTeamId != null) {
      cleanSheetsByTeam.set(
        m.awayTeamId,
        (cleanSheetsByTeam.get(m.awayTeamId) ?? 0) + 1,
      );
    }

    const events = (m.rawEvents as MatchEvent[] | null) ?? [];
    for (const ev of events) {
      if (ev.type === "goal") {
        goalsByPlayer.set(ev.playerId, (goalsByPlayer.get(ev.playerId) ?? 0) + 1);
      } else if (ev.type === "assist") {
        assistsByPlayer.set(
          ev.playerId,
          (assistsByPlayer.get(ev.playerId) ?? 0) + 1,
        );
      }
      // own_goal: ignore for player-scoring (doesn't credit the scorer)
    }
  }

  return { goalsByPlayer, assistsByPlayer, cleanSheetsByTeam };
}

function scoreLineups(
  user: User,
  picks: LineupPick[],
  matchesByRound: Record<LineupRound, Match[]>,
  lookup: PlayerStatLookup,
  now: number,
): ScoreRow[] {
  const userPicks = picks.filter((p) => p.userEmail === user.email);
  if (userPicks.length === 0) return [];

  const rows: ScoreRow[] = [];
  for (const round of LINEUP_ROUNDS) {
    const roundPicks = userPicks.filter((p) => p.round === round);
    if (roundPicks.length === 0) continue;

    const { goalsByPlayer, assistsByPlayer, cleanSheetsByTeam } = tallyRoundStats(
      matchesByRound[round] ?? [],
    );

    for (const pick of roundPicks) {
      let pts = 0;
      const goals = goalsByPlayer.get(pick.playerId) ?? 0;
      const assists = assistsByPlayer.get(pick.playerId) ?? 0;
      pts += goals * RULES.LINEUP_GOAL;
      pts += assists * RULES.LINEUP_ASSIST;

      if (pick.position === "GK" || pick.position === "DEF") {
        const teamId = lookup.playerTeam.get(pick.playerId);
        if (teamId != null) {
          const cs = cleanSheetsByTeam.get(teamId) ?? 0;
          pts +=
            cs *
            (pick.position === "GK"
              ? RULES.LINEUP_CLEAN_SHEET_GK
              : RULES.LINEUP_CLEAN_SHEET_DEF);
        }
      }

      rows.push({
        userEmail: user.email,
        category: "lineup",
        key: `lineup:${round}:${pick.position}`,
        points: pts,
        computedAt: now,
      });
    }
  }
  return rows;
}

// ─── Top-level ──────────────────────────────────────────────────────────

export interface ComputeInput {
  users: User[];
  matches: Match[];
  groupPicks: GroupPick[];
  wildcardPicks: WildcardPick[];
  bracketPicks: BracketPick[];
  tournamentPicks: TournamentPick[];
  lineupPicks: LineupPick[];
  /** player_id → team_id, needed for golden glove + lineup clean-sheet credit. */
  playerTeamById: Map<number, number>;
  /** player_id → position, needed for lineup validation only (not strictly required here). */
  playerPositionById: Map<number, "GK" | "DEF" | "MID" | "FWD">;
}

/**
 * Compute the full set of score rows for every user, given the current
 * recorded matches. Idempotent: re-running on identical input produces
 * identical output (same rows, same point values).
 */
export function computeAllScores(input: ComputeInput): ScoreRow[] {
  const actual = computeActuals(input.matches);
  const now = Math.floor(Date.now() / 1000);
  const tournamentByUser = new Map(
    input.tournamentPicks.map((p) => [p.userEmail, p]),
  );

  // Pre-bucket matches by round for lineup scoring.
  const matchesByRound: Record<LineupRound, Match[]> = {
    group: [], r32: [], r16: [], qf: [], sf: [], final: [],
  };
  for (const m of input.matches) {
    if (m.stage in matchesByRound) {
      matchesByRound[m.stage as LineupRound].push(m);
    }
  }

  const playerStatLookup = {
    playerTeam: input.playerTeamById,
    playerPosition: input.playerPositionById,
  };

  const out: ScoreRow[] = [];
  for (const u of input.users) {
    out.push(...scoreGroups(u, input.groupPicks, actual, now));
    out.push(...scoreWildcards(u, input.wildcardPicks, actual, now));
    out.push(...scoreBracket(u, input.bracketPicks, actual, now));
    out.push(
      ...scoreTournament(
        u,
        tournamentByUser.get(u.email),
        actual,
        input.playerTeamById,
        now,
      ),
    );
    out.push(
      ...scoreLineups(u, input.lineupPicks, matchesByRound, playerStatLookup, now),
    );
  }
  return out;
}
