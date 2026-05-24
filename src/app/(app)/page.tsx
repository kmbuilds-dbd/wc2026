import { count, eq, sql, and } from "drizzle-orm";
import { PageHeader } from "@/components/page-header";
import { FIRST_KICKOFF_UTC } from "@/lib/locks";
import { getUserEmail } from "@/lib/auth";
import { getDb } from "@/db/client";
import {
  groupPicks,
  wildcardPicks,
  tournamentPicks,
  lineupPicks,
  teams,
} from "@/db/schema";

function daysUntilKickoff() {
  const diff = FIRST_KICKOFF_UTC * 1000 - Date.now();
  return Math.max(0, Math.ceil(diff / (24 * 60 * 60 * 1000)));
}

async function getPicksSummary(email: string) {
  try {
    const db = await getDb();

    const [groupTotal, groupDone, wildcardDone, tournamentRow, lineupGroupDone] =
      await Promise.all([
        db
          .select({ n: sql<number>`count(distinct ${teams.groupLetter})` })
          .from(teams)
          .get(),
        db
          .select({ n: count() })
          .from(groupPicks)
          .where(eq(groupPicks.userEmail, email))
          .get(),
        db
          .select({ n: count() })
          .from(wildcardPicks)
          .where(eq(wildcardPicks.userEmail, email))
          .get(),
        db
          .select()
          .from(tournamentPicks)
          .where(eq(tournamentPicks.userEmail, email))
          .get(),
        db
          .select({ n: count() })
          .from(lineupPicks)
          .where(and(eq(lineupPicks.userEmail, email), eq(lineupPicks.round, "group")))
          .get(),
      ]);

    const numGroups = groupTotal?.n ?? 16;
    const tournamentDone = [
      tournamentRow?.winnerTeamId,
      tournamentRow?.topScorerPlayerId,
      tournamentRow?.goldenGlovePlayerId,
    ].filter(Boolean).length;

    return {
      groups: { done: groupDone?.n ?? 0, total: numGroups * 2 },
      wildcards: { done: wildcardDone?.n ?? 0, total: 8 },
      tournament: { done: tournamentDone, total: 3 },
      lineupGroup: { done: lineupGroupDone?.n ?? 0, total: 4 },
    };
  } catch {
    return null;
  }
}

export default async function DashboardPage() {
  const email = await getUserEmail();
  const days = daysUntilKickoff();
  const progress = email ? await getPicksSummary(email) : null;

  return (
    <>
      <PageHeader
        eyebrow="Closed group · 50 max"
        title="Pick the"
        highlight="World"
        subtitle="48 nations. Three group-stage rounds, then knockouts. Bracket locks at first kickoff."
      >
        <div className="flex flex-col items-end gap-2">
          <span className="inline-flex items-center gap-1.5 font-mono text-[10px] px-2.5 py-1 rounded-full bg-confirmed/10 border border-confirmed/25 text-confirmed">
            <span className="wc-live-dot" />
            LIVE
          </span>
          <div className="font-mono text-[10px] text-text-muted text-right leading-relaxed">
            Bracket locks in
            <br />
            <span className="text-accent font-mono text-base">
              {days} {days === 1 ? "day" : "days"}
            </span>
          </div>
        </div>
      </PageHeader>

      {progress && <PicksChecklist progress={progress} />}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-6">
        <Card href="/picks" label="Your picks" desc="Groups, wildcards, bracket, top scorer, golden glove, winner." />
        <Card href="/leaderboard" label="Leaderboard" desc="Live standings across the group." />
        <Card href="/teams" label="Squad tracker" desc="All 48 nations' final 26-man lists, status, omissions." />
        <Card href="/odds" label="Live odds" desc="Tournament winner, top scorer, group winners. Daily refresh." />
        <Card
          href={email ? `/users/${encodeURIComponent(email)}` : "#"}
          label="Your locked roster"
          desc="Visible to others after each category locks."
        />
        <Card
          href="/picks/lineup/group"
          label="Lineup picks"
          desc="1 GK · 1 DEF · 1 MID · 1 FWD for the group stage and each KO round. Pool: teams still alive."
        />
      </div>

      <div className="mt-10 rounded border border-border-base bg-surface p-5 font-mono text-[11px] text-text-muted leading-relaxed">
        Signed in as{" "}
        <span className="text-text">{email ?? "(not yet — visit will trigger CF Access PIN)"}</span>
      </div>
    </>
  );
}

type Progress = NonNullable<Awaited<ReturnType<typeof getPicksSummary>>>;

function PicksChecklist({ progress }: { progress: Progress }) {
  const rows: { label: string; href: string; done: number; total: number }[] = [
    { label: "Group picks (1st & 2nd per group)", href: "/picks", done: progress.groups.done, total: progress.groups.total },
    { label: "Best 3rds — wildcard slots", href: "/picks", done: progress.wildcards.done, total: progress.wildcards.total },
    { label: "Winner · Top Scorer · Golden Glove", href: "/picks", done: progress.tournament.done, total: progress.tournament.total },
    { label: "Lineup — Group stage", href: "/picks/lineup/group", done: progress.lineupGroup.done, total: progress.lineupGroup.total },
  ];

  const allDone = rows.every((r) => r.done === r.total);

  return (
    <section className="mb-6 rounded border border-border-base bg-surface overflow-hidden">
      <div className="px-5 py-3 border-b border-border-base flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-text-muted">
          Your checklist
        </span>
        {allDone ? (
          <span className="font-mono text-[10px] uppercase tracking-widest text-confirmed">
            All done ✓
          </span>
        ) : (
          <span className="font-mono text-[10px] text-text-dim">
            {rows.filter((r) => r.done === r.total).length}/{rows.length} complete
          </span>
        )}
      </div>
      <div className="divide-y divide-border-base">
        {rows.map((row) => {
          const complete = row.done === row.total;
          const started = row.done > 0;
          return (
            <a
              key={row.label}
              href={row.href}
              className="flex items-center justify-between px-5 py-3 hover:bg-border-base/20 transition-colors"
            >
              <span className="text-sm text-text-muted">{row.label}</span>
              <span
                className={`font-mono text-xs tabular-nums ${
                  complete
                    ? "text-confirmed"
                    : started
                    ? "text-accent"
                    : "text-text-dim"
                }`}
              >
                {complete ? `${row.done} / ${row.total} ✓` : `${row.done} / ${row.total}`}
              </span>
            </a>
          );
        })}
      </div>
    </section>
  );
}

function Card({ href, label, desc }: { href: string; label: string; desc: string }) {
  return (
    <a
      href={href}
      className="block rounded border border-border-base bg-surface p-5 hover:border-accent/30 transition-colors"
    >
      <div className="font-mono text-[10px] uppercase tracking-[0.15em] text-text-muted mb-1.5">
        →
      </div>
      <div className="font-display text-2xl text-text leading-tight">{label}</div>
      <div className="text-xs text-text-muted mt-2 leading-relaxed">{desc}</div>
    </a>
  );
}
