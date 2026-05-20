"use client";

/**
 * Interactive squad-tracker view.
 *
 * Port of wc2026_worker/worker.js:249–428. Same data shape (TrackerTeam from
 * src/data/tracker-snapshot.ts), same visual hierarchy (gold accent on dark
 * surface, status-tinted badges, expandable rows). Uses React state instead
 * of the original's vanilla DOM toggling — at 48 cards the difference is
 * imperceptible.
 */
import { Fragment, useMemo, useState } from "react";
import { PageHeader } from "@/components/page-header";
import type { TrackerTeam, SquadStatus } from "@/data/tracker-snapshot";

type Filter = "all" | SquadStatus;

const FILTERS: Filter[] = ["all", "confirmed", "preliminary", "pending"];

const STATUS_CLASS: Record<SquadStatus, string> = {
  confirmed: "bg-confirmed/10 text-confirmed border-confirmed/25",
  preliminary: "bg-preliminary/10 text-preliminary border-preliminary/25",
  pending: "bg-pending/10 text-pending border-pending/25",
};

const POSITION_CLASS = {
  GK: "bg-preliminary/10 text-preliminary border-preliminary/20",
  DEF: "bg-confirmed/10 text-confirmed border-confirmed/20",
  MID: "bg-pending/10 text-pending border-pending/20",
  FWD: "bg-danger/10 text-danger border-danger/20",
} as const;

export function TeamsView({ teams }: { teams: TrackerTeam[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [allExpanded, setAllExpanded] = useState(false);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return teams.filter((t) => {
      if (filter !== "all" && t.s !== filter) return false;
      if (!q) return true;
      if (t.n.toLowerCase().includes(q)) return true;
      if (t.c?.toLowerCase().includes(q)) return true;
      const players = [t.sq.GK, t.sq.DEF, t.sq.MID, t.sq.FWD].flat().join(" ").toLowerCase();
      return players.includes(q);
    });
  }, [teams, filter, search]);

  const grouped = useMemo(() => {
    const out = new Map<string, TrackerTeam[]>();
    for (const t of visible) {
      if (!out.has(t.g)) out.set(t.g, []);
      out.get(t.g)!.push(t);
    }
    return Array.from(out.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [visible]);

  const isExpanded = (name: string) => allExpanded || expanded.has(name);
  const toggle = (name: string) => {
    setAllExpanded(false);
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  return (
    <>
      <PageHeader
        eyebrow="All 48 nations · USA / Canada / Mexico"
        title="Squad"
        highlight="tracker"
        subtitle="Confirmed / preliminary / pending status, omissions, first-game line. Ported from the standalone tracker worker."
      >
        <span className="inline-flex items-center gap-1.5 font-mono text-[10px] px-2.5 py-1 rounded-full bg-confirmed/10 border border-confirmed/25 text-confirmed">
          <span className="wc-live-dot" />
          LIVE
        </span>
      </PageHeader>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2 mb-5">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search team, coach, player…"
          className="flex-1 min-w-[180px] max-w-[260px] bg-surface border border-border-base rounded px-3 py-1.5 text-text font-mono text-[11px] outline-none focus:border-accent/30"
        />
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`font-mono text-[10px] uppercase tracking-[0.08em] px-3 py-1 rounded-sm border ${
              filter === f
                ? "bg-accent/10 text-accent border-accent/30"
                : "bg-transparent text-text-muted border-border-base hover:bg-accent/10 hover:text-accent hover:border-accent/30"
            }`}
          >
            {f}
          </button>
        ))}
        <button
          onClick={() => {
            setAllExpanded((v) => !v);
            setExpanded(new Set());
          }}
          className="ml-auto font-mono text-[10px] uppercase tracking-[0.08em] px-3 py-1 rounded-sm border border-border-base bg-transparent text-text-muted hover:bg-accent/10 hover:text-accent hover:border-accent/30"
        >
          {allExpanded ? "Collapse all" : "Expand all"}
        </button>
      </div>

      <div className="font-mono text-[10px] text-text-muted mb-4">
        <span className="text-accent">{visible.length}</span> of {teams.length} teams shown
      </div>

      <div className="flex flex-col gap-0.5">
        {grouped.map(([group, list]) => (
          <Fragment key={group}>
            <div className="font-display text-[13px] tracking-[0.15em] text-accent border-b border-accent/20 py-5 pb-2 mb-1 mt-3 first:mt-0">
              GROUP {group}
            </div>
            {list.map((t) => (
              <TeamCard
                key={t.n}
                team={t}
                expanded={isExpanded(t.n)}
                onToggle={() => toggle(t.n)}
              />
            ))}
          </Fragment>
        ))}
        {visible.length === 0 && (
          <div className="text-center py-12 font-mono text-[11px] text-text-dim">
            No teams match.
          </div>
        )}
      </div>
    </>
  );
}

function TeamCard({
  team,
  expanded,
  onToggle,
}: {
  team: TrackerTeam;
  expanded: boolean;
  onToggle: () => void;
}) {
  const hasSquad =
    team.sq.GK.length || team.sq.DEF.length || team.sq.MID.length || team.sq.FWD.length;

  return (
    <div
      className={`bg-surface border rounded overflow-hidden ${
        expanded ? "border-accent/30" : "border-border-base hover:border-accent/15"
      }`}
    >
      <button
        onClick={onToggle}
        className="w-full grid grid-cols-[40px_1fr_auto_auto] items-center gap-3 px-5 py-3.5 text-left cursor-pointer"
      >
        <div className="text-2xl text-center leading-none">{team.f}</div>
        <div>
          <div className="font-display text-lg tracking-[0.03em] text-text">{team.n}</div>
          <div className="text-[11px] text-text-muted italic mt-0.5">{team.c}</div>
        </div>
        <div>
          <span
            className={`font-mono text-[9px] uppercase tracking-[0.08em] px-2 py-0.5 rounded-sm border ${
              STATUS_CLASS[team.s]
            }`}
          >
            {team.sl}
          </span>
        </div>
        <div
          className={`w-6 h-6 flex items-center justify-center transition-transform ${
            expanded ? "rotate-180 text-accent" : "text-text-muted"
          }`}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path
              d="M4 6L8 10L12 6"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border-base p-5 grid grid-cols-1 md:grid-cols-[1fr_260px] gap-6">
          {/* Squad */}
          <div>
            <h3 className="font-mono text-[9px] tracking-[0.2em] uppercase text-text-muted mb-3">
              SQUAD
            </h3>
            {team.note && (
              <div className="text-[11px] text-text-muted italic mb-3 px-2.5 py-2 bg-preliminary/5 border border-preliminary/10 rounded-sm leading-relaxed">
                {team.note}
              </div>
            )}
            {hasSquad ? (
              (["GK", "DEF", "MID", "FWD"] as const).map((pos) => (
                <PositionGroup key={pos} pos={pos} players={team.sq[pos]} />
              ))
            ) : (
              <div className="text-[11px] text-text-dim italic py-2">
                Squad not yet released.
              </div>
            )}
            <div className="mt-3.5 px-2.5 py-2 bg-accent/5 border border-accent/10 rounded-sm">
              <div className="font-mono text-[9px] tracking-[0.12em] uppercase text-accent mb-1">
                Group {team.g}
              </div>
              <div className="text-[11px] text-text-muted">{team.fg}</div>
            </div>
          </div>

          {/* Omissions */}
          <div className="border-l-2 border-surface-2 pl-5">
            <h3 className="font-mono text-[9px] tracking-[0.2em] uppercase text-text-muted mb-3">
              NOTABLE OMISSIONS
            </h3>
            {team.om.length > 0 ? (
              team.om.map((o, i) => (
                <div
                  key={i}
                  className="px-3 py-2.5 bg-danger/[0.04] border border-danger/10 rounded-sm mb-1.5"
                >
                  <div className="text-xs font-medium mb-1 flex gap-1.5 before:content-['—'] before:text-danger before:flex-shrink-0">
                    {o.n}
                  </div>
                  <div className="text-[11px] text-text-muted leading-relaxed pl-3.5">
                    {o.r}
                  </div>
                </div>
              ))
            ) : (
              <div className="text-[11px] text-text-dim italic py-2">
                No omissions listed.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function PositionGroup({
  pos,
  players,
}: {
  pos: keyof typeof POSITION_CLASS;
  players: string[];
}) {
  return (
    <div className="mb-3.5">
      <span
        className={`font-mono text-[9px] tracking-[0.12em] uppercase px-1.5 py-0.5 rounded-sm border inline-block mb-2 ${
          POSITION_CLASS[pos]
        }`}
      >
        {pos}
      </span>
      <div className="flex flex-wrap gap-1.5">
        {players.length === 0 && (
          <em className="text-text-dim text-[11px]">Not yet released</em>
        )}
        {players.map((p) => (
          <span
            key={p}
            className="text-[11px] text-text bg-surface-2 border border-border-base rounded-sm px-2 py-0.5"
          >
            {p}
          </span>
        ))}
      </div>
    </div>
  );
}
