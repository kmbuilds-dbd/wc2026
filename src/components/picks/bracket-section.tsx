"use client";

/**
 * KO bracket picks: 31 winners across R32 → Final.
 *
 * Three-state lifecycle (see locks.ts → getBracketWindow):
 *   pending → group stage hasn't finished, matchups not yet decided
 *   open    → editable window between group stage end and R32 first kickoff
 *   locked  → R32 first kickoff has passed, picks frozen
 *
 * No matchup-slot resolution yet — each pick is just "which team wins this
 * named slot." When real fixtures land we'll annotate each slot with its
 * resolved matchup (e.g. "R32 #1 = winner of Group A vs best-3rd from CDEF").
 */
import { useMemo, useState, useTransition } from "react";
import { saveBracketPicks } from "@/app/picks/actions";
import { teamList } from "@/lib/teams-data";
import {
  BRACKET_SLOT_COUNT,
  ROUND_LABEL,
  slotsByRound,
  type BracketRound,
} from "@/lib/bracket-shape";
import type { BracketWindow } from "@/lib/locks";
import { SectionHeader, SaveBar } from "./shared";
import { PendingPanel } from "./pending-panel";

interface Props {
  /** existing picks: { 'r32-1': teamId, ... 'final': teamId } */
  initial: Record<string, number>;
  bracket: BracketWindow;
}

const ROUND_GRID: Record<BracketRound, string> = {
  r32: "grid-cols-1 md:grid-cols-2 lg:grid-cols-4",
  r16: "grid-cols-1 md:grid-cols-2 lg:grid-cols-4",
  qf: "grid-cols-1 md:grid-cols-2 lg:grid-cols-4",
  sf: "grid-cols-1 md:grid-cols-2",
  final: "grid-cols-1",
};

export function BracketSection({ initial, bracket }: Props) {
  const locked = bracket.state !== "open";

  const [picks, setPicks] = useState<Record<string, number | null>>(() => {
    const out: Record<string, number | null> = {};
    for (const { slots } of slotsByRound()) {
      for (const s of slots) out[s.slot] = initial[s.slot] ?? null;
    }
    return out;
  });
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const completed = useMemo(
    () => Object.values(picks).filter((v) => v !== null).length,
    [picks],
  );

  if (bracket.state === "pending") {
    return (
      <section className="mb-12">
        <SectionHeader
          eyebrow="Section 3 of 4"
          title="KO bracket"
          subtitle="Pick the winner of every knockout match — Round of 32 through the Final."
          completed={0}
          total={BRACKET_SLOT_COUNT}
        />
        <PendingPanel
          opensAt={bracket.opensAt}
          title="Bracket picks unlock after group stage"
          explainer="Matchups for the Round of 32 are decided by group standings — picks open"
        />
      </section>
    );
  }

  function setPick(slot: string, teamId: number | null) {
    setPicks((p) => ({ ...p, [slot]: teamId }));
    setStatus(null);
    setError(null);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (locked) return;
    setStatus(null);
    setError(null);
    const form = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await saveBracketPicks(form);
      if (res.ok) setStatus(`Saved ${res.saved} bracket picks at ${new Date().toLocaleTimeString()}`);
      else setError(res.error);
    });
  }

  return (
    <section className="mb-12">
      <SectionHeader
        eyebrow="Section 3 of 4"
        title="KO bracket"
        subtitle="Pick the winner of every knockout match — Round of 32 through the Final."
        completed={completed}
        total={BRACKET_SLOT_COUNT}
      />
      <form onSubmit={onSubmit}>
        <div className="space-y-6">
          {slotsByRound().map(({ round, slots }) => (
            <div key={round}>
              <div className="font-display text-base tracking-[0.1em] text-accent mb-2 border-b border-accent/15 pb-1.5">
                {ROUND_LABEL[round]} · {slots.length} {slots.length === 1 ? "match" : "matches"}
              </div>
              <div className={`grid gap-3 ${ROUND_GRID[round]}`}>
                {slots.map((s) => {
                  const current = picks[s.slot];
                  return (
                    <div
                      key={s.slot}
                      className="bg-surface border border-border-base rounded p-3"
                    >
                      <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-text-muted mb-1.5">
                        {s.label}
                      </div>
                      <select
                        name={`slot_${s.slot}`}
                        value={current ?? ""}
                        disabled={locked}
                        onChange={(e) =>
                          setPick(s.slot, e.target.value ? Number(e.target.value) : null)
                        }
                        className="w-full bg-surface-2 border border-border-base text-text rounded-sm px-2 py-1.5 text-sm focus:border-accent/40 outline-none disabled:opacity-50"
                      >
                        <option value="">— pick winner —</option>
                        {teamList.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.flag} {t.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <SaveBar
          locked={locked}
          isPending={isPending}
          status={status}
          error={error}
          completed={completed}
          total={BRACKET_SLOT_COUNT}
          saveLabel="Save bracket picks"
        />
      </form>
    </section>
  );
}
