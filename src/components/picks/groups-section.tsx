"use client";

/**
 * Group-stage pick form: 12 group cards, each with 1st/2nd dropdowns.
 *
 * Server-side validation lives in @/app/picks/actions.ts → saveGroupPicks.
 * Client side enforces the same "don't pick the same team for 1st and 2nd"
 * rule by greying out already-selected options.
 */
import { useState, useTransition } from "react";
import { saveGroupPicks } from "@/app/picks/actions";
import { groupLetters, teamsInGroup, type UiTeam } from "@/lib/teams-data";

interface Props {
  /** existing picks: { 'A:1': teamId, 'A:2': teamId, ... } */
  initial: Record<string, number>;
  locked: boolean;
}

export function GroupsSection({ initial, locked }: Props) {
  const [picks, setPicks] = useState<Record<string, number | null>>(() => {
    const out: Record<string, number | null> = {};
    for (const letter of groupLetters) {
      out[`${letter}:1`] = initial[`${letter}:1`] ?? null;
      out[`${letter}:2`] = initial[`${letter}:2`] ?? null;
    }
    return out;
  });
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function setPick(letter: string, rank: 1 | 2, teamId: number | null) {
    setPicks((p) => ({ ...p, [`${letter}:${rank}`]: teamId }));
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
      const res = await saveGroupPicks(form);
      if (res.ok) setStatus(`Saved ${res.saved} picks at ${new Date().toLocaleTimeString()}`);
      else setError(res.error);
    });
  }

  const completed = Object.values(picks).filter((v) => v !== null).length;

  return (
    <section className="mb-12">
      <SectionHeader
        eyebrow="Section 1 of 4"
        title="Group standings"
        subtitle="Pick 1st & 2nd in each of the 12 groups (24 picks)."
        completed={completed}
        total={24}
      />
      <form onSubmit={onSubmit}>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {groupLetters.map((letter) => (
            <GroupCard
              key={letter}
              letter={letter}
              teams={teamsInGroup(letter)}
              first={picks[`${letter}:1`]}
              second={picks[`${letter}:2`]}
              onPick={(rank, id) => setPick(letter, rank, id)}
              locked={locked}
            />
          ))}
        </div>
        <SaveBar
          locked={locked}
          isPending={isPending}
          status={status}
          error={error}
          completed={completed}
          total={24}
        />
      </form>
    </section>
  );
}

function GroupCard({
  letter,
  teams,
  first,
  second,
  onPick,
  locked,
}: {
  letter: string;
  teams: UiTeam[];
  first: number | null;
  second: number | null;
  onPick: (rank: 1 | 2, id: number | null) => void;
  locked: boolean;
}) {
  const opts = (excludeId: number | null) =>
    teams.map((t) => (
      <option
        key={t.id}
        value={t.id}
        disabled={excludeId !== null && t.id === excludeId}
      >
        {t.flag} {t.name}
      </option>
    ));

  return (
    <div className="bg-surface border border-border-base rounded p-4">
      <div className="font-display text-base tracking-[0.1em] text-accent mb-3">
        GROUP {letter}
      </div>
      <div className="space-y-2.5">
        <label className="block">
          <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted">
            1st place
          </span>
          <select
            name={`group_${letter}_1`}
            value={first ?? ""}
            disabled={locked}
            onChange={(e) =>
              onPick(1, e.target.value ? Number(e.target.value) : null)
            }
            className="mt-1 w-full bg-surface-2 border border-border-base text-text rounded-sm px-2 py-1.5 text-sm focus:border-accent/40 outline-none disabled:opacity-50"
          >
            <option value="">— pick —</option>
            {opts(second)}
          </select>
        </label>
        <label className="block">
          <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted">
            2nd place
          </span>
          <select
            name={`group_${letter}_2`}
            value={second ?? ""}
            disabled={locked}
            onChange={(e) =>
              onPick(2, e.target.value ? Number(e.target.value) : null)
            }
            className="mt-1 w-full bg-surface-2 border border-border-base text-text rounded-sm px-2 py-1.5 text-sm focus:border-accent/40 outline-none disabled:opacity-50"
          >
            <option value="">— pick —</option>
            {opts(first)}
          </select>
        </label>
      </div>
    </div>
  );
}

function SectionHeader({
  eyebrow,
  title,
  subtitle,
  completed,
  total,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  completed: number;
  total: number;
}) {
  return (
    <div className="mb-5">
      <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent">
        {eyebrow} · {completed}/{total} done
      </div>
      <h2 className="font-display text-3xl text-text mt-1">{title}</h2>
      <p className="text-xs text-text-muted mt-1">{subtitle}</p>
    </div>
  );
}

function SaveBar({
  locked,
  isPending,
  status,
  error,
  completed,
  total,
}: {
  locked: boolean;
  isPending: boolean;
  status: string | null;
  error: string | null;
  completed: number;
  total: number;
}) {
  return (
    <div className="sticky bottom-0 mt-5 -mx-5 px-5 py-3 bg-bg/95 backdrop-blur border-t border-border-base flex items-center justify-between gap-4 z-10">
      <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted">
        {completed}/{total} picks ·{" "}
        {error ? (
          <span className="text-danger normal-case tracking-normal">{error}</span>
        ) : status ? (
          <span className="text-confirmed normal-case tracking-normal">{status}</span>
        ) : (
          <span className="normal-case tracking-normal">Unsaved changes won&apos;t persist</span>
        )}
      </div>
      <button
        type="submit"
        disabled={locked || isPending}
        className="font-mono text-[11px] uppercase tracking-[0.1em] px-4 py-2 bg-accent text-bg rounded-sm hover:bg-accent/90 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {locked ? "Locked" : isPending ? "Saving…" : "Save group picks"}
      </button>
    </div>
  );
}
