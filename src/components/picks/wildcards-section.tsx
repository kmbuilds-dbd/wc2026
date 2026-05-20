"use client";

/**
 * Wildcards section: 8 picks for which best-3rd-place teams advance to R32.
 *
 * Each slot is a 48-team dropdown that excludes teams already picked in the
 * other 7 slots, so the user can't duplicate. Server action enforces the
 * same rule.
 */
import { useMemo, useState, useTransition } from "react";
import { saveWildcardPicks } from "@/app/picks/actions";
import { teamList } from "@/lib/teams-data";
import { SectionHeader, SaveBar } from "./shared";

interface Props {
  /** existing picks: { 1: teamId, 2: teamId, ... 8: teamId } */
  initial: Record<number, number>;
  locked: boolean;
}

export function WildcardsSection({ initial, locked }: Props) {
  const [picks, setPicks] = useState<Record<number, number | null>>(() => {
    const out: Record<number, number | null> = {};
    for (let slot = 1; slot <= 8; slot++) out[slot] = initial[slot] ?? null;
    return out;
  });
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const takenIds = useMemo(
    () => new Set(Object.values(picks).filter((v): v is number => v !== null)),
    [picks],
  );

  const completed = takenIds.size;

  function setPick(slot: number, teamId: number | null) {
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
      const res = await saveWildcardPicks(form);
      if (res.ok) setStatus(`Saved ${res.saved} wildcard picks at ${new Date().toLocaleTimeString()}`);
      else setError(res.error);
    });
  }

  return (
    <section className="mb-12">
      <SectionHeader
        eyebrow="Section 2 of 4"
        title="Wildcard picks"
        subtitle="Pick the 8 best 3rd-place teams that advance to the Round of 32."
        completed={completed}
        total={8}
      />
      <form onSubmit={onSubmit}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((slot) => {
            const current = picks[slot];
            return (
              <div key={slot} className="bg-surface border border-border-base rounded p-3 flex items-center gap-3">
                <span className="font-display text-2xl text-accent w-8 text-center">{slot}</span>
                <select
                  name={`wc_${slot}`}
                  value={current ?? ""}
                  disabled={locked}
                  onChange={(e) => setPick(slot, e.target.value ? Number(e.target.value) : null)}
                  className="flex-1 bg-surface-2 border border-border-base text-text rounded-sm px-2 py-1.5 text-sm focus:border-accent/40 outline-none disabled:opacity-50"
                >
                  <option value="">— pick a team —</option>
                  {teamList.map((t) => (
                    <option
                      key={t.id}
                      value={t.id}
                      disabled={takenIds.has(t.id) && t.id !== current}
                    >
                      {t.flag} {t.name} (Group {t.groupLetter})
                    </option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>
        <SaveBar
          locked={locked}
          isPending={isPending}
          status={status}
          error={error}
          completed={completed}
          total={8}
          saveLabel="Save wildcard picks"
        />
      </form>
    </section>
  );
}
