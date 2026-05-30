"use server";

/**
 * Server actions for /picks.
 *
 * Each section (groups, wildcards, bracket, tournament) has its own action.
 * All write paths must call isLocked() before mutating.
 *
 * Form-data conventions:
 *   groups   — keys `group_{A..L}_{1|2}` = team id (number)
 *   wildcards — keys `wc_1..wc_8`        = team id
 *   bracket   — keys `slot_{r32-1..final}` = team id
 *   tournament— keys `winner`, `top_scorer_player`, `golden_glove_player` = ids
 *
 * Returns a small status object; we revalidate the path for SSR refresh.
 */
import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  groupPicks,
  wildcardPicks,
  bracketPicks,
  tournamentPicks,
  lineupPicks,
  matches,
} from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { isLocked, type LineupRound } from "@/lib/locks";
import { groupLetters, teamById } from "@/lib/teams-data";
import { playerById } from "@/lib/players-data";
import { BRACKET_SLOTS, isValidSlot } from "@/lib/bracket-shape";
import { computeAliveTeamsFromMatches } from "@/lib/scoring/alive";
import { buildBracketMatchups } from "@/lib/bracket-matchups";

export type ActionResult =
  | { ok: true; saved: number }
  | { ok: false; error: string };

// ─── Groups ─────────────────────────────────────────────────────────────

export async function saveGroupPicks(formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  if (await isLocked("group")) {
    return { ok: false, error: "Group picks are locked." };
  }

  const rows: Array<{
    userEmail: string;
    groupLetter: string;
    rank: number;
    teamId: number;
    updatedAt: number;
  }> = [];
  const now = Math.floor(Date.now() / 1000);

  for (const letter of groupLetters) {
    for (const rank of [1, 2] as const) {
      const raw = formData.get(`group_${letter}_${rank}`);
      if (raw === null || raw === "" || raw === undefined) continue;
      const teamId = Number(raw);
      if (!Number.isInteger(teamId) || !teamById.has(teamId)) {
        return { ok: false, error: `Invalid team id for group ${letter} rank ${rank}.` };
      }
      // Validate the team is in that group.
      if (teamById.get(teamId)!.groupLetter !== letter) {
        return {
          ok: false,
          error: `Team ${teamById.get(teamId)!.name} is not in group ${letter}.`,
        };
      }
      rows.push({
        userEmail: user.email,
        groupLetter: letter,
        rank,
        teamId,
        updatedAt: now,
      });
    }
  }

  // Reject same team picked for both 1st and 2nd in a single group.
  const seen = new Set<string>();
  const groupTopTwoTeamIds = new Set<number>();
  for (const r of rows) {
    const k = `${r.groupLetter}:${r.teamId}`;
    if (seen.has(k)) {
      return {
        ok: false,
        error: `Same team picked for both 1st and 2nd in group ${r.groupLetter}.`,
      };
    }
    seen.add(k);
    groupTopTwoTeamIds.add(r.teamId);
  }

  const db = await getDb();
  const existingWildcards = await db
    .select()
    .from(wildcardPicks)
    .where(eq(wildcardPicks.userEmail, user.email));
  const conflictingWildcard = existingWildcards.find((p) => groupTopTwoTeamIds.has(p.teamId));
  if (conflictingWildcard) {
    return {
      ok: false,
      error: `${teamById.get(conflictingWildcard.teamId)!.name} is already used as a wildcard pick. Remove it from wildcards before using it in your group top 2.`,
    };
  }

  await db.delete(groupPicks).where(eq(groupPicks.userEmail, user.email));
  for (const r of rows) await db.insert(groupPicks).values(r);

  revalidatePath("/picks");
  return { ok: true, saved: rows.length };
}

// ─── Wildcards (8 best-3rd picks) ───────────────────────────────────────

export async function saveWildcardPicks(formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  if (await isLocked("wildcard")) {
    return { ok: false, error: "Wildcard picks are locked." };
  }
  const now = Math.floor(Date.now() / 1000);
  const rows: Array<{ userEmail: string; slot: number; teamId: number; updatedAt: number }> = [];

  for (let slot = 1; slot <= 8; slot++) {
    const raw = formData.get(`wc_${slot}`);
    if (raw === null || raw === "" || raw === undefined) continue;
    const teamId = Number(raw);
    if (!Number.isInteger(teamId) || !teamById.has(teamId)) {
      return { ok: false, error: `Invalid team for wildcard ${slot}.` };
    }
    rows.push({ userEmail: user.email, slot, teamId, updatedAt: now });
  }

  // Reject duplicates across the 8 slots.
  const seen = new Set<number>();
  for (const r of rows) {
    if (seen.has(r.teamId)) {
      return { ok: false, error: `Team ${teamById.get(r.teamId)!.name} picked twice in wildcards.` };
    }
    seen.add(r.teamId);
  }

  const db = await getDb();
  const existingGroupPicks = await db
    .select()
    .from(groupPicks)
    .where(eq(groupPicks.userEmail, user.email));
  const groupTopTwoTeamIds = new Set(existingGroupPicks.map((p) => p.teamId));
  const conflictingGroupPick = rows.find((p) => groupTopTwoTeamIds.has(p.teamId));
  if (conflictingGroupPick) {
    return {
      ok: false,
      error: `${teamById.get(conflictingGroupPick.teamId)!.name} is already used in your group top 2 and cannot also be a wildcard pick.`,
    };
  }

  await db.delete(wildcardPicks).where(eq(wildcardPicks.userEmail, user.email));
  for (const r of rows) await db.insert(wildcardPicks).values(r);

  revalidatePath("/picks");
  return { ok: true, saved: rows.length };
}

// ─── Bracket (31 KO match winners) ──────────────────────────────────────

export async function saveBracketPicks(formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  if (await isLocked("bracket")) {
    return { ok: false, error: "Bracket picks are locked." };
  }
  const now = Math.floor(Date.now() / 1000);
  const rows: Array<{ userEmail: string; matchSlot: string; teamId: number; updatedAt: number }> = [];

  for (const s of BRACKET_SLOTS) {
    const raw = formData.get(`slot_${s.slot}`);
    if (raw === null || raw === "" || raw === undefined) continue;
    const teamId = Number(raw);
    if (!Number.isInteger(teamId) || !teamById.has(teamId)) {
      return { ok: false, error: `Invalid team for ${s.label}.` };
    }
    if (!isValidSlot(s.slot)) {
      return { ok: false, error: `Unknown bracket slot ${s.slot}.` };
    }
    rows.push({ userEmail: user.email, matchSlot: s.slot, teamId, updatedAt: now });
  }

  const db = await getDb();
  const knockoutMatches = await db
    .select()
    .from(matches)
    .where(sql`${matches.stage} != 'group'`)
    .orderBy(matches.kickoffUtc, matches.id);
  const matchupBySlot = new Map(buildBracketMatchups(knockoutMatches).map((m) => [m.slot, m]));
  for (const r of rows) {
    const matchup = matchupBySlot.get(r.matchSlot);
    if (!matchup || matchup.homeTeamId == null || matchup.awayTeamId == null) continue;
    if (r.teamId !== matchup.homeTeamId && r.teamId !== matchup.awayTeamId) {
      return {
        ok: false,
        error: `${teamById.get(r.teamId)!.name} is not in ${r.matchSlot}'s resolved matchup.`,
      };
    }
  }

  for (const r of rows) {
    await db
      .insert(bracketPicks)
      .values(r)
      .onConflictDoUpdate({
        target: [bracketPicks.userEmail, bracketPicks.matchSlot],
        set: { teamId: r.teamId, updatedAt: r.updatedAt },
      });
  }

  revalidatePath("/picks");
  return { ok: true, saved: rows.length };
}

// ─── Lineup picks (per KO round: 1 GK + 1 DEF + 1 MID + 1 FWD) ──────────

const LINEUP_POSITIONS = ["GK", "DEF", "MID", "FWD"] as const;
type LineupPosition = (typeof LINEUP_POSITIONS)[number];

export async function saveLineupPicks(
  round: LineupRound,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  if (round === "group") {
    return { ok: false, error: "Lineup picks open at the knockout stage." };
  }
  if (await isLocked("lineup", round)) {
    return { ok: false, error: `${round.toUpperCase()} lineup is locked.` };
  }

  // Determine alive teams from current match data — picks must be from
  // players whose team is still in the tournament for this round.
  const db = await getDb();
  const matchRows = await db.select().from(matches);
  const aliveTeams = computeAliveTeamsFromMatches(round, matchRows);

  const now = Math.floor(Date.now() / 1000);
  const rows: Array<{
    userEmail: string;
    round: LineupRound;
    position: LineupPosition;
    playerId: number;
    updatedAt: number;
  }> = [];

  for (const pos of LINEUP_POSITIONS) {
    const raw = formData.get(`lineup_${pos}`);
    if (raw === null || raw === "" || raw === undefined) continue;
    const playerId = Number(raw);
    if (!Number.isInteger(playerId)) {
      return { ok: false, error: `Invalid player id for ${pos}.` };
    }
    const player = playerById.get(playerId);
    if (!player) {
      return { ok: false, error: `Unknown player for ${pos}.` };
    }
    if (player.position !== pos) {
      return {
        ok: false,
        error: `${player.name} is ${player.position}, not ${pos}.`,
      };
    }
    if (!aliveTeams.has(player.teamId)) {
      return {
        ok: false,
        error: `${player.teamName} is no longer alive in ${round.toUpperCase()}.`,
      };
    }
    rows.push({ userEmail: user.email, round, position: pos, playerId, updatedAt: now });
  }

  for (const r of rows) {
    await db
      .insert(lineupPicks)
      .values(r)
      .onConflictDoUpdate({
        target: [lineupPicks.userEmail, lineupPicks.round, lineupPicks.position],
        set: { playerId: r.playerId, updatedAt: r.updatedAt },
      });
  }

  revalidatePath(`/picks/lineup/${round}`);
  return { ok: true, saved: rows.length };
}

// ─── Tournament-level (winner + top scorer + golden glove) ──────────────

export async function saveTournamentPicks(formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  if (await isLocked("tournament")) {
    return { ok: false, error: "Tournament picks are locked." };
  }
  const now = Math.floor(Date.now() / 1000);

  const winnerRaw = formData.get("winner");
  const topRaw = formData.get("top_scorer_player");
  const gloveRaw = formData.get("golden_glove_player");

  const winnerTeamId = winnerRaw ? Number(winnerRaw) : null;
  const topScorerPlayerId = topRaw ? Number(topRaw) : null;
  const goldenGlovePlayerId = gloveRaw ? Number(gloveRaw) : null;

  if (winnerTeamId !== null && !teamById.has(winnerTeamId)) {
    return { ok: false, error: "Invalid winner team." };
  }
  if (topScorerPlayerId !== null && !playerById.has(topScorerPlayerId)) {
    return { ok: false, error: "Invalid top scorer player." };
  }
  if (goldenGlovePlayerId !== null) {
    const player = playerById.get(goldenGlovePlayerId);
    if (!player) {
      return { ok: false, error: "Invalid Golden Glove player." };
    }
    if (player.position !== "GK") {
      return { ok: false, error: `${player.name} is not a goalkeeper.` };
    }
  }

  const db = await getDb();
  await db
    .insert(tournamentPicks)
    .values({
      userEmail: user.email,
      winnerTeamId,
      topScorerPlayerId,
      goldenGlovePlayerId,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: tournamentPicks.userEmail,
      set: {
        winnerTeamId,
        topScorerPlayerId,
        goldenGlovePlayerId,
        updatedAt: now,
      },
    });

  revalidatePath("/picks");
  return { ok: true, saved: 1 };
}
