import { eq, sql } from "drizzle-orm";
import { PageHeader } from "@/components/page-header";
import { LockBanner } from "@/components/lock-banner";
import { GroupsSection } from "@/components/picks/groups-section";
import { ComingSoon } from "@/components/coming-soon";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/db/client";
import { groupPicks, teams } from "@/db/schema";
import { isLocked } from "@/lib/locks";
import { seedTeamsFromSnapshot } from "@/lib/seed/teams-from-snapshot";

export const metadata = {
  title: "Your picks — WC2026 pick'em",
};

export default async function PicksPage() {
  const user = await requireUser();
  const db = await getDb();

  // Bootstrap: if the teams table is empty (no api-football seed yet,
  // see progress.md → "Data provider deferred"), auto-seed from the
  // bundled tracker snapshot so picks have valid FK targets. Idempotent;
  // runs at most once per app lifetime.
  const teamCount = await db
    .select({ n: sql<number>`count(*)` })
    .from(teams)
    .get();
  if ((teamCount?.n ?? 0) === 0) {
    await seedTeamsFromSnapshot();
  }

  // Load existing group picks for this user, indexed by 'A:1' / 'A:2' etc.
  const existingGroups = await db
    .select()
    .from(groupPicks)
    .where(eq(groupPicks.userEmail, user.email));
  const groupInitial: Record<string, number> = {};
  for (const r of existingGroups) {
    groupInitial[`${r.groupLetter}:${r.rank}`] = r.teamId;
  }

  const locked = await isLocked("group");

  return (
    <>
      <PageHeader
        eyebrow={`Signed in as ${user.email}`}
        title="Your"
        highlight="picks"
        subtitle="Groups, wildcards, KO bracket, tournament winner, top scorer, Golden Glove."
      />

      {/* Tournament-wide lock (all four sections lock at first kickoff). */}
      <LockBanner scope="tournament" />

      <GroupsSection initial={groupInitial} locked={locked} />

      <section className="mb-12 opacity-60">
        <h2 className="font-display text-3xl text-text">Wildcards (Day 7)</h2>
        <p className="text-xs text-text-muted mt-1 mb-4">
          8 best 3rd-place teams predictions.
        </p>
        <ComingSoon label="Wildcards · Day 7" shipBy="2026-05-26" />
      </section>

      <section className="mb-12 opacity-60">
        <h2 className="font-display text-3xl text-text">KO bracket (Day 7)</h2>
        <p className="text-xs text-text-muted mt-1 mb-4">
          31 KO winners from R32 through the Final.
        </p>
        <ComingSoon label="Bracket · Day 7" shipBy="2026-05-26" />
      </section>

      <section className="mb-12 opacity-60">
        <h2 className="font-display text-3xl text-text">Tournament-level (Day 8)</h2>
        <p className="text-xs text-text-muted mt-1 mb-4">
          Tournament winner · Top scorer · Golden Glove.
        </p>
        <ComingSoon label="Tournament picks · Day 8" shipBy="2026-05-28" />
      </section>
    </>
  );
}
