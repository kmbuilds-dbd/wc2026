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
import { getDb } from "@/db/client";
import {
  groupPicks,
  wildcardPicks,
  bracketPicks,
  tournamentPicks,
} from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { isLocked } from "@/lib/locks";
import { groupLetters, teamById } from "@/lib/teams-data";
import { BRACKET_SLOTS, isValidSlot } from "@/lib/bracket-shape";

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
  for (const r of rows) {
    const k = `${r.groupLetter}:${r.teamId}`;
    if (seen.has(k)) {
      return {
        ok: false,
        error: `Same team picked for both 1st and 2nd in group ${r.groupLetter}.`,
      };
    }
    seen.add(k);
  }

  const db = await getDb();
  for (const r of rows) {
    await db
      .insert(groupPicks)
      .values(r)
      .onConflictDoUpdate({
        target: [groupPicks.userEmail, groupPicks.groupLetter, groupPicks.rank],
        set: { teamId: r.teamId, updatedAt: r.updatedAt },
      });
  }

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
  for (const r of rows) {
    await db
      .insert(wildcardPicks)
      .values(r)
      .onConflictDoUpdate({
        target: [wildcardPicks.userEmail, wildcardPicks.slot],
        set: { teamId: r.teamId, updatedAt: r.updatedAt },
      });
  }

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
