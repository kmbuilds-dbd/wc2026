"use client";

/**
 * Group-stage pick form: 12 group cards, each with 1st/2nd dropdowns.
 *
 * Server-side validation lives in @/app/(app)/picks/actions.ts → saveGroupPicks.
 * Client side enforces the same "don't pick the same team for 1st and 2nd"
 * rule by greying out already-selected options.
 */
import { useState, useTransition } from "react";
import { saveGroupPicks } from "@/app/(app)/picks/actions";
import { groupLetters, teamsInGroup, type UiTeam } from "@/lib/teams-data";
import { SectionHeader, SaveBar } from "./shared";

interface Props {
  /** existing picks: { 'A:1': teamId, 'A:2': teamId, ... } */
  initial: Record<string, number>;
  locked: boolean;
  oddsGroupWinners: Record<string, number>;
  oddsGroupSecondPlace: Record<string, number>;
}

export function GroupsSection({
  initial,
  locked,
  oddsGroupWinners,
  oddsGroupSecondPlace,
}: Props) {
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
    setPicks((p) => {
      const next = { ...p, [`${letter}:${rank}`]: teamId };
      window.dispatchEvent(
        new CustomEvent("wc2026:group-picks-change", {
          detail: Object.values(next).filter((v): v is number => v !== null),
        }),
      );
      return next;
    });
    setStatus(null);
    setError(null);
  }

  function dispatchGroupPicks(next: Record<string, number | null>) {
    window.dispatchEvent(
      new CustomEvent("wc2026:group-picks-change", {
        detail: Object.values(next).filter((v): v is number => v !== null),
      }),
    );
  }

  function useBestOdds() {
    if (locked) return;
    setPicks((current) => {
      const next = { ...current };
      let filled = 0;

      for (const letter of groupLetters) {
        const firstKey = `${letter}:1`;
        const secondKey = `${letter}:2`;
        const suggestedWinnerId = oddsGroupWinners[letter];
        if (suggestedWinnerId && next[firstKey] === null && next[secondKey] !== suggestedWinnerId) {
          next[firstKey] = suggestedWinnerId;
          filled += 1;
        }

        const firstPick = next[firstKey];
        const suggestedSecondId = oddsGroupSecondPlace[letter];
        if (suggestedSecondId && next[secondKey] === null && firstPick !== suggestedSecondId) {
          next[secondKey] = suggestedSecondId;
          filled += 1;
        }
      }

      dispatchGroupPicks(next);
      setStatus(
        filled > 0
          ? `Filled ${filled} blank group ${filled === 1 ? "pick" : "picks"} from odds. Press Save to keep them.`
          : "No blank group picks could be filled from odds.",
      );
      setError(null);
      return next;
    });
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
        <div className="flex justify-end mb-3">
          <button
            type="button"
            disabled={locked}
            onClick={useBestOdds}
            className="px-3 py-2 rounded-sm border border-accent/30 bg-accent/10 text-accent font-mono text-[10px] uppercase tracking-[0.14em] hover:bg-accent/15 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Use best odds
          </button>
        </div>
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
          saveLabel="Save group picks"
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
