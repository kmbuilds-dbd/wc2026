import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { LockBanner } from "@/components/lock-banner";
import { LineupSection } from "@/components/picks/lineup-section";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/db/client";
import { lineupPicks, matches } from "@/db/schema";
import { isLocked, type LineupRound } from "@/lib/locks";
import { computeAliveTeamsFromMatches } from "@/lib/scoring/alive";
import type { PlayerPosition } from "@/lib/players-data";

const ROUNDS = ["r32", "r16", "qf", "sf", "final"] as const;
const ROUND_LABEL: Record<LineupRound, string> = {
  r32: "Round of 32",
  r16: "Round of 16",
  qf: "Quarter-finals",
  sf: "Semi-finals",
  final: "Final",
};

export default async function LineupRoundPage({
  params,
}: {
  params: Promise<{ round: string }>;
}) {
  const { round } = await params;
  if (!ROUNDS.includes(round as LineupRound)) notFound();
  const r = round as LineupRound;

  const user = await requireUser();
  const db = await getDb();

  const [existing, allMatches] = await Promise.all([
    db
      .select()
      .from(lineupPicks)
      .where(and(eq(lineupPicks.userEmail, user.email), eq(lineupPicks.round, r))),
    db.select().from(matches),
  ]);

  const initial: Partial<Record<PlayerPosition, number>> = {};
  for (const row of existing) {
    initial[row.position as PlayerPosition] = row.playerId;
  }

  const aliveTeamIds = Array.from(computeAliveTeamsFromMatches(r, allMatches));
  const locked = await isLocked("lineup", r);

  return (
    <>
      <PageHeader
        eyebrow={`Lineup · ${ROUND_LABEL[r]}`}
        title="Your"
        highlight="lineup"
        subtitle={`One pick per position, from teams still alive in ${ROUND_LABEL[r]}. Goals + assists + clean sheets score.`}
      />

      <LockBanner scope="lineup" round={r} />

      {/* Round nav so users can hop between R32 → Final without going home. */}
      <div className="flex gap-2 mb-5 flex-wrap">
        {ROUNDS.map((nav) => (
          <a
            key={nav}
            href={`/picks/lineup/${nav}`}
            className={`font-mono text-[10px] uppercase tracking-[0.08em] px-3 py-1.5 rounded-sm border ${
              nav === r
                ? "bg-accent/10 text-accent border-accent/30"
                : "bg-transparent text-text-muted border-border-base hover:bg-accent/10 hover:text-accent hover:border-accent/30"
            }`}
          >
            {ROUND_LABEL[nav]}
          </a>
        ))}
      </div>

      <div className="mb-6 font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted">
        {aliveTeamIds.length} teams alive in {ROUND_LABEL[r]}
      </div>

      <LineupSection
        round={r}
        roundLabel={ROUND_LABEL[r]}
        aliveTeamIds={aliveTeamIds}
        initial={initial}
        locked={locked}
      />
    </>
  );
}
