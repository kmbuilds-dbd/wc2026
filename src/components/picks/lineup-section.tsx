"use client";

/**
 * Per-round lineup picker: 1 GK + 1 DEF + 1 MID + 1 FWD, from teams still
 * alive in that round. Single dropdown per position, players grouped by
 * team via <optgroup> for findability.
 */
import { useMemo, useState, useTransition } from "react";
import { saveLineupPicks } from "@/app/picks/actions";
import type { LineupRound } from "@/lib/locks";
import { playerList, type UiPlayer, type PlayerPosition } from "@/lib/players-data";
import { teamById } from "@/lib/teams-data";
import { SectionHeader, SaveBar } from "./shared";

interface Props {
  round: LineupRound;
  roundLabel: string;
  aliveTeamIds: number[];
  initial: Partial<Record<PlayerPosition, number>>;
  locked: boolean;
}

const POSITIONS: PlayerPosition[] = ["GK", "DEF", "MID", "FWD"];

const POSITION_LABEL: Record<PlayerPosition, string> = {
  GK: "Goalkeeper",
  DEF: "Defender",
  MID: "Midfielder",
  FWD: "Forward",
};

const POSITION_HINT: Record<PlayerPosition, string> = {
  GK: "Clean sheets score big.",
  DEF: "Clean sheets + occasional goals.",
  MID: "Goals + assists.",
  FWD: "Pure goalscorer.",
};

export function LineupSection({
  round,
  roundLabel,
  aliveTeamIds,
  initial,
  locked,
}: Props) {
  const [picks, setPicks] = useState<Partial<Record<PlayerPosition, number>>>(
    initial,
  );
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const alive = useMemo(() => new Set(aliveTeamIds), [aliveTeamIds]);

  /**
   * For each position, build { teamName: UiPlayer[] } grouped & sorted, so
   * the dropdown renders one <optgroup> per alive team.
   */
  const groupedByPosition = useMemo(() => {
    const out: Record<PlayerPosition, Map<string, UiPlayer[]>> = {
      GK: new Map(),
      DEF: new Map(),
      MID: new Map(),
      FWD: new Map(),
    };
    for (const p of playerList) {
      if (!alive.has(p.teamId)) continue;
      const m = out[p.position];
      const arr = m.get(p.teamName) ?? [];
      arr.push(p);
      m.set(p.teamName, arr);
    }
    return out;
  }, [alive]);

  const completed = POSITIONS.filter((pos) => picks[pos] != null).length;

  function setPick(pos: PlayerPosition, playerId: number | null) {
    setPicks((p) => ({ ...p, [pos]: playerId ?? undefined }));
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
      const res = await saveLineupPicks(round, form);
      if (res.ok)
        setStatus(`Saved ${res.saved} lineup picks at ${new Date().toLocaleTimeString()}`);
      else setError(res.error);
    });
  }

  return (
    <section className="mb-12">
      <SectionHeader
        eyebrow={`Lineup · ${roundLabel}`}
        title="Your"
        subtitle={`Pick 1 of each position. Pool is teams still alive in ${roundLabel}. Repeats from a previous round are fine.`}
        completed={completed}
        total={4}
      />
      <form onSubmit={onSubmit}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {POSITIONS.map((pos) => {
            const current = picks[pos];
            const groups = groupedByPosition[pos];
            const teamNamesSorted = Array.from(groups.keys()).sort();
            return (
              <div key={pos} className="bg-surface border border-border-base rounded p-4">
                <div className="flex items-baseline justify-between mb-2">
                  <span className="font-display text-base tracking-[0.1em] text-accent">
                    {POSITION_LABEL[pos].toUpperCase()}
                  </span>
                  <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-dim">
                    {pos}
                  </span>
                </div>
                <p className="text-[11px] text-text-muted mb-2">{POSITION_HINT[pos]}</p>
                <select
                  name={`lineup_${pos}`}
                  value={current ?? ""}
                  disabled={locked}
                  onChange={(e) =>
                    setPick(pos, e.target.value ? Number(e.target.value) : null)
                  }
                  className="w-full bg-surface-2 border border-border-base text-text rounded-sm px-2 py-1.5 text-sm focus:border-accent/40 outline-none disabled:opacity-50"
                >
                  <option value="">— pick a {POSITION_LABEL[pos].toLowerCase()} —</option>
                  {teamNamesSorted.map((teamName) => {
                    const t = [...teamById.values()].find((x) => x.name === teamName);
                    const flag = t?.flag ?? "";
                    return (
                      <optgroup key={teamName} label={`${flag} ${teamName}`}>
                        {groups.get(teamName)!.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                            {p.club ? ` (${p.club})` : ""}
                            {p.injured ? " ⚠" : ""}
                          </option>
                        ))}
                      </optgroup>
                    );
                  })}
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
          total={4}
          saveLabel={`Save ${roundLabel} lineup`}
        />
      </form>
    </section>
  );
}
