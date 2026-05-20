/**
 * Seed the D1 `teams` table directly from the bundled tracker snapshot.
 *
 * Used while the data-source decision is deferred (see progress.md). Lets
 * the picks UI reference real team rows (FK target) without depending on
 * api-football or any third party. Idempotent: upserts by synthetic id.
 *
 * Synthetic id = (index+1) of the team in src/data/tracker-snapshot.ts,
 * which matches src/lib/teams-data.ts → teamList. Same scheme on both
 * sides → no remap needed.
 */
import { getDb } from "@/db/client";
import { teams } from "@/db/schema";
import { teamList } from "@/lib/teams-data";
import { trackerEntry } from "@/lib/teams-data";

export interface SeedTeamsFromSnapshotResult {
  inserted: number;
  updated: number;
  total: number;
}

export async function seedTeamsFromSnapshot(): Promise<SeedTeamsFromSnapshotResult> {
  const db = await getDb();

  let count = 0;
  for (const t of teamList) {
    const raw = trackerEntry(t.id);
    await db
      .insert(teams)
      .values({
        id: t.id,
        name: t.name,
        flag: t.flag,
        groupLetter: t.groupLetter,
        coach: t.coach,
        apiSportsData: raw ?? null,
      })
      .onConflictDoUpdate({
        target: teams.id,
        set: {
          name: t.name,
          flag: t.flag,
          groupLetter: t.groupLetter,
          coach: t.coach,
          apiSportsData: raw ?? null,
        },
      });
    count++;
  }

  // D1 onConflictDoUpdate doesn't surface insert-vs-update — return totals.
  return { inserted: count, updated: 0, total: count };
}
