import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/db/client";
import {
  users,
  groupPicks,
  wildcardPicks,
  bracketPicks,
  tournamentPicks,
  lineupPicks,
} from "@/db/schema";
import { isLocked, type LineupRound } from "@/lib/locks";
import { teamById, groupLetters } from "@/lib/teams-data";
import { playerById } from "@/lib/players-data";
import {
  BRACKET_SLOTS,
  ROUND_LABEL,
  slotsByRound,
  type BracketRound,
} from "@/lib/bracket-shape";

export const metadata = {
  title: "Player picks — WC2026",
};

const LINEUP_ROUNDS: LineupRound[] = ["r32", "r16", "qf", "sf", "final"];
const LINEUP_ROUND_LABEL: Record<LineupRound, string> = {
  r32: "Round of 32",
  r16: "Round of 16",
  qf: "Quarter-finals",
  sf: "Semi-finals",
  final: "Final",
};

function fmtUtc(sec: number): string {
  return new Date(sec * 1000).toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

export default async function UserPicksPage({
  params,
}: {
  params: Promise<{ email: string }>;
}) {
  const viewer = await requireUser();
  const { email: rawEmail } = await params;
  const targetEmail = decodeURIComponent(rawEmail).toLowerCase();

  const db = await getDb();
  const target = await db
    .select()
    .from(users)
    .where(eq(users.email, targetEmail))
    .get();
  if (!target) notFound();

  const isSelf = viewer.email === target.email;

  const [
    gPicks,
    wPicks,
    bPicks,
    tPick,
    lPicks,
    tournamentLocked,
    r32Locked,
    r16Locked,
    qfLocked,
    sfLocked,
    finalLocked,
  ] = await Promise.all([
    db.select().from(groupPicks).where(eq(groupPicks.userEmail, targetEmail)),
    db.select().from(wildcardPicks).where(eq(wildcardPicks.userEmail, targetEmail)),
    db.select().from(bracketPicks).where(eq(bracketPicks.userEmail, targetEmail)),
    db.select().from(tournamentPicks).where(eq(tournamentPicks.userEmail, targetEmail)).get(),
    db.select().from(lineupPicks).where(eq(lineupPicks.userEmail, targetEmail)),
    isLocked("group"),
    isLocked("lineup", "r32"),
    isLocked("lineup", "r16"),
    isLocked("lineup", "qf"),
    isLocked("lineup", "sf"),
    isLocked("lineup", "final"),
  ]);

  const lineupLocks: Record<LineupRound, boolean> = {
    r32: r32Locked,
    r16: r16Locked,
    qf: qfLocked,
    sf: sfLocked,
    final: finalLocked,
  };

  // Self always sees own picks; others see only locked categories.
  const canSee = (locked: boolean) => isSelf || locked;

  // Pick-data lookups
  const groupByKey = new Map(gPicks.map((p) => [`${p.groupLetter}:${p.rank}`, p]));
  const wildcardBySlot = new Map(wPicks.map((p) => [p.slot, p]));
  const bracketBySlot = new Map(bPicks.map((p) => [p.matchSlot, p]));
  const lineupByKey = new Map(
    lPicks.map((p) => [`${p.round}:${p.position}`, p]),
  );

  return (
    <>
      <PageHeader
        eyebrow={isSelf ? "Your roster" : `Other player's roster`}
        title={target.displayName}
        subtitle={
          isSelf
            ? "Your own picks — visible only to you."
            : "Their tournament picks become visible to everyone after the Jun 11 kickoff; lineup picks per round."
        }
      >
        <div className="font-mono text-[10px] text-text-muted text-right leading-relaxed">
          {target.email}
          <br />
          <span className="text-text-dim">since {fmtUtc(target.createdAt)}</span>
        </div>
      </PageHeader>

      {/* Groups */}
      <Section
        title="Group standings"
        sub="1st & 2nd per group · 24 picks"
        revealMsg={tournamentLocked ? null : "Reveals at Jun 11 20:00 UTC kickoff."}
        canSee={canSee(tournamentLocked)}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {groupLetters.map((letter) => {
            const first = groupByKey.get(`${letter}:1`);
            const second = groupByKey.get(`${letter}:2`);
            return (
              <div key={letter} className="bg-surface border border-border-base rounded p-4">
                <div className="font-display text-base tracking-[0.1em] text-accent mb-2">
                  GROUP {letter}
                </div>
                <PickRow rank="1st" team={first?.teamId} />
                <PickRow rank="2nd" team={second?.teamId} />
              </div>
            );
          })}
        </div>
      </Section>

      {/* Wildcards */}
      <Section
        title="Wildcards"
        sub="8 best-3rd picks"
        revealMsg={tournamentLocked ? null : "Reveals at Jun 11 20:00 UTC kickoff."}
        canSee={canSee(tournamentLocked)}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((slot) => (
            <div
              key={slot}
              className="bg-surface border border-border-base rounded p-3 flex items-center gap-3"
            >
              <span className="font-display text-2xl text-accent w-8 text-center">
                {slot}
              </span>
              <TeamCell teamId={wildcardBySlot.get(slot)?.teamId ?? null} />
            </div>
          ))}
        </div>
      </Section>

      {/* Bracket */}
      <Section
        title="KO bracket"
        sub="R32 → Final · 31 picks"
        revealMsg={tournamentLocked ? null : "Reveals at Jun 11 20:00 UTC kickoff."}
        canSee={canSee(tournamentLocked)}
      >
        <div className="space-y-5">
          {slotsByRound().map(({ round, slots }) => (
            <div key={round}>
              <div className="font-display text-base tracking-[0.1em] text-accent mb-2 border-b border-accent/15 pb-1.5">
                {ROUND_LABEL[round as BracketRound]} · {slots.length}{" "}
                {slots.length === 1 ? "match" : "matches"}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                {slots.map((s) => (
                  <div
                    key={s.slot}
                    className="bg-surface border border-border-base rounded p-2 flex items-center gap-2"
                  >
                    <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-text-dim w-10 flex-shrink-0">
                      {s.slot.replace(`${round}-`, `#`)}
                    </span>
                    <TeamCell teamId={bracketBySlot.get(s.slot)?.teamId ?? null} compact />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* Tournament */}
      <Section
        title="Tournament-level"
        sub="Winner · Top scorer · Golden Glove"
        revealMsg={tournamentLocked ? null : "Reveals at Jun 11 20:00 UTC kickoff."}
        canSee={canSee(tournamentLocked)}
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Card label="WINNER">
            <TeamCell teamId={tPick?.winnerTeamId ?? null} />
          </Card>
          <Card label="TOP SCORER">
            <PlayerCell playerId={tPick?.topScorerPlayerId ?? null} />
          </Card>
          <Card label="GOLDEN GLOVE">
            <PlayerCell playerId={tPick?.goldenGlovePlayerId ?? null} />
          </Card>
        </div>
      </Section>

      {/* Lineups — per round, gated independently */}
      <Section title="Lineup picks" sub="1 GK · 1 DEF · 1 MID · 1 FWD per KO round" canSee={true}>
        <div className="space-y-3">
          {LINEUP_ROUNDS.map((round) => {
            const locked = lineupLocks[round];
            const visible = canSee(locked);
            return (
              <div
                key={round}
                className="bg-surface border border-border-base rounded p-4"
              >
                <div className="flex items-baseline justify-between mb-3">
                  <span className="font-display text-base tracking-[0.1em] text-accent">
                    {LINEUP_ROUND_LABEL[round].toUpperCase()}
                  </span>
                  {!visible && (
                    <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-text-dim">
                      Reveals when round starts
                    </span>
                  )}
                </div>
                {visible ? (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {(["GK", "DEF", "MID", "FWD"] as const).map((pos) => (
                      <LineupCell
                        key={pos}
                        position={pos}
                        playerId={lineupByKey.get(`${round}:${pos}`)?.playerId ?? null}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="font-mono text-[10px] text-text-dim text-center py-4">
                    Hidden until {LINEUP_ROUND_LABEL[round]} kickoff
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Section>
    </>
  );
}

// ─── Display primitives ────────────────────────────────────────────────

function Section({
  title,
  sub,
  revealMsg,
  canSee,
  children,
}: {
  title: string;
  sub: string;
  revealMsg?: string | null;
  canSee: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-10">
      <div className="mb-4">
        <h2 className="font-display text-2xl text-text">{title}</h2>
        <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted mt-0.5">
          {sub}
        </div>
      </div>
      {canSee ? (
        children
      ) : (
        <div className="rounded border border-border-base bg-surface px-4 py-6 text-center">
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-text-muted mb-1">
            🔒 Locked from view
          </div>
          <div className="text-xs text-text-muted">
            {revealMsg ?? "Hidden until this pick category locks."}
          </div>
        </div>
      )}
    </section>
  );
}

function PickRow({ rank, team }: { rank: string; team: number | null | undefined }) {
  return (
    <div className="flex items-center gap-2 py-1.5">
      <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted w-10">
        {rank}
      </span>
      <TeamCell teamId={team ?? null} compact />
    </div>
  );
}

function TeamCell({ teamId, compact = false }: { teamId: number | null; compact?: boolean }) {
  if (teamId == null) {
    return (
      <span className="text-text-dim italic text-[11px]">No pick</span>
    );
  }
  const t = teamById.get(teamId);
  if (!t) return <span className="text-danger text-[11px]">Unknown team #{teamId}</span>;
  return (
    <span className={`flex items-center gap-1.5 ${compact ? "text-[12px]" : "text-sm"} text-text`}>
      <span>{t.flag}</span>
      <span>{t.name}</span>
    </span>
  );
}

function PlayerCell({ playerId }: { playerId: number | null }) {
  if (playerId == null) {
    return <span className="text-text-dim italic text-[11px]">No pick</span>;
  }
  const p = playerById.get(playerId);
  if (!p) return <span className="text-danger text-[11px]">Unknown player #{playerId}</span>;
  const team = teamById.get(p.teamId);
  return (
    <div className="text-sm text-text">
      <div>{p.name}</div>
      <div className="font-mono text-[10px] text-text-muted">
        {p.position} · {team?.flag} {p.teamName}
      </div>
    </div>
  );
}

function LineupCell({
  position,
  playerId,
}: {
  position: "GK" | "DEF" | "MID" | "FWD";
  playerId: number | null;
}) {
  return (
    <div className="bg-surface-2 border border-border-base rounded p-2.5">
      <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-text-muted mb-1">
        {position}
      </div>
      <PlayerCell playerId={playerId} />
    </div>
  );
}

function Card({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-surface border border-border-base rounded p-4">
      <div className="font-display text-base tracking-[0.1em] text-accent mb-2">
        {label}
      </div>
      {children}
    </div>
  );
}
