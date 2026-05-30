import type { PickWindow } from "@/lib/locks";

const LINEUP_ROUNDS = [
  { key: "r32", label: "Round of 32" },
  { key: "r16", label: "Round of 16" },
  { key: "qf", label: "Quarter-finals" },
  { key: "sf", label: "Semi-finals" },
  { key: "final", label: "Final" },
] as const;

function fmtUtc(sec: number): string {
  return new Date(sec * 1000).toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

export function LineupOverviewSection({
  r32Window,
  completed,
}: {
  r32Window: PickWindow;
  completed: number;
}) {
  const pending = r32Window.state === "pending";
  const total = LINEUP_ROUNDS.length * 4;

  return (
    <section className="mb-12">
      <div className="mb-5">
        <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent">
          Section 5 of 5 · {completed}/{total} done
        </div>
        <h2 className="font-display text-3xl text-text mt-1">Lineup picks</h2>
        <p className="text-xs text-text-muted mt-1">
          Knockout-only lineups: 1 GK, 1 DEF, 1 MID, and 1 FWD per round.
        </p>
      </div>

      <div className="bg-surface border border-border-base rounded p-5">
        {pending ? (
          <div className="mb-4 rounded border border-accent/20 bg-accent/5 px-4 py-3">
            <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-accent">
              Locked until group stage ends
            </div>
            <p className="text-xs text-text-muted mt-1 leading-relaxed">
              Lineup picks open for the Round of 32 once knockout teams are known.
              First unlock: <span className="text-text">{fmtUtc(r32Window.opensAt)}</span>.
            </p>
          </div>
        ) : null}

        <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
          {LINEUP_ROUNDS.map((round) => {
            const href = `/picks/lineup/${round.key}`;
            return pending ? (
              <div
                key={round.key}
                className="rounded-sm border border-border-base bg-bg/30 px-3 py-3 opacity-70"
              >
                <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted">
                  Locked
                </div>
                <div className="text-sm text-text mt-1">{round.label}</div>
              </div>
            ) : (
              <a
                key={round.key}
                href={href}
                className="rounded-sm border border-border-base bg-bg/30 px-3 py-3 hover:border-accent/30 hover:bg-accent/5"
              >
                <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-accent">
                  Open
                </div>
                <div className="text-sm text-text mt-1">{round.label}</div>
              </a>
            );
          })}
        </div>
      </div>
    </section>
  );
}
