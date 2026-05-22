import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { LockBanner } from "@/components/lock-banner";
import { LineupSection } from "@/components/picks/lineup-section";
import { PendingPanel } from "@/components/picks/pending-panel";
import { ScoringLegend } from "@/components/picks/scoring-legend";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/db/client";
import { lineupPicks, matches } from "@/db/schema";
import { getLineupWindow, type KoRound, type LineupRound } from "@/lib/locks";
import { computeAliveTeamsFromMatches } from "@/lib/scoring/alive";
import type { PlayerPosition } from "@/lib/players-data";

const ROUNDS = ["group", "r32", "r16", "qf", "sf", "final"] as const;
const ROUND_LABEL: Record<LineupRound, string> = {
  group: "Group stage",
  r32: "Round of 32",
  r16: "Round of 16",
  qf: "Quarter-finals",
  sf: "Semi-finals",
  final: "Final",
};

const PENDING_TEXT: Record<KoRound, { title: string; explainer: string }> = {
  r32: {
    title: "R32 lineup unlocks after group stage",
    explainer:
      "Player pool will be the 16 group winners, 16 runners-up, and 8 best 3rd-place qualifiers — opens",
  },
  r16: {
    title: "R16 lineup unlocks after Round of 32",
    explainer: "Player pool will be the 16 R32 winners — opens",
  },
  qf: {
    title: "Quarter-finals lineup unlocks after R16",
    explainer: "Player pool will be the 8 R16 winners — opens",
  },
  sf: {
    title: "Semi-finals lineup unlocks after the quarter-finals",
    explainer: "Player pool will be the 4 QF winners — opens",
  },
  final: {
    title: "Final lineup unlocks after the semi-finals",
    explainer: "Player pool will be the 2 SF winners — opens",
  },
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
  const window = await getLineupWindow(r);

  // Round nav rendered on every state so users can hop between rounds.
  const roundNav = (
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
  );

  if (window.state === "pending" && r !== "group") {
    const text = PENDING_TEXT[r];
    return (
      <>
        <PageHeader
          eyebrow={`Lineup · ${ROUND_LABEL[r]}`}
          title="Your"
          highlight="lineup"
          subtitle={`One pick per position, from teams still alive in ${ROUND_LABEL[r]}. Goals + assists + clean sheets score.`}
        />
        {roundNav}
        <ScoringLegend scope="lineup" />
        <PendingPanel
          opensAt={window.opensAt}
          title={text.title}
          explainer={text.explainer}
        />
      </>
    );
  }

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
  const locked = window.state === "locked";

  return (
    <>
      <PageHeader
        eyebrow={`Lineup · ${ROUND_LABEL[r]}`}
        title="Your"
        highlight="lineup"
        subtitle={`One pick per position, from teams still alive in ${ROUND_LABEL[r]}. Goals + assists + clean sheets score.`}
      />

      <LockBanner scope="lineup" round={r} />

      {roundNav}

      <ScoringLegend scope="lineup" />

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
