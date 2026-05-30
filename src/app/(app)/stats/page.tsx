import { requireUser } from "@/lib/auth";
import {
  loadQualificationStats,
  QUALIFICATION_COMPETITIONS,
  type GroupTable,
  type StatsCategory,
  type StatsRow,
} from "@/lib/qualification-stats";

export const metadata = {
  title: "Qualification stats - WC2026 pick'em",
  description: "Top World Cup qualification player and team stats.",
};

function fmtUtc(sec: number) {
  return new Date(sec * 1000).toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

function valueFor(row: StatsRow, label: string) {
  const exact = row.values[label];
  if (exact) return exact;
  const found = Object.entries(row.values).find(
    ([key]) => key.toLowerCase() === label.toLowerCase(),
  );
  if (found) return found[1];
  return "-";
}

function StatsTable({
  kind,
  valueLabel,
  rows,
}: {
  kind: "players" | "teams";
  valueLabel: string;
  rows: StatsRow[];
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded border border-border-base bg-surface p-5 text-sm text-text-muted">
        No cached rows yet.
      </div>
    );
  }

  return (
    <div className="border border-border-base bg-surface rounded overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted border-b border-border-base">
            <th className="px-3 py-2 text-left">#</th>
            <th className="px-3 py-2 text-left">{kind === "players" ? "Player" : "Team"}</th>
            {kind === "players" ? <th className="px-3 py-2 text-left">Team</th> : null}
            <th className="px-3 py-2 text-right">{valueLabel}</th>
            <th className="px-3 py-2 text-right">Apps</th>
            <th className="px-3 py-2 text-right">Mins</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={`${row.rank}-${row.name}`}
              className="border-b border-border-base/50 last:border-0 hover:bg-surface-2"
            >
              <td className="px-3 py-2 font-mono text-text-muted">{row.rank}</td>
              <td className="px-3 py-2 text-text whitespace-nowrap">{row.name}</td>
              {kind === "players" ? (
                <td className="px-3 py-2 text-text-muted whitespace-nowrap">
                  {row.team ?? "-"}
                </td>
              ) : null}
              <td className="px-3 py-2 text-right font-mono text-text">{valueFor(row, valueLabel)}</td>
              <td className="px-3 py-2 text-right font-mono text-text-muted">{valueFor(row, "Apps")}</td>
              <td className="px-3 py-2 text-right font-mono text-text-muted">{valueFor(row, "Mins")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CategoryList({
  kind,
  categories,
}: {
  kind: "players" | "teams";
  categories: StatsCategory[];
}) {
  if (categories.length === 0) {
    return <StatsTable kind={kind} valueLabel="Value" rows={[]} />;
  }

  return (
    <div className="space-y-3">
      {categories.map((category, index) => (
        <details
          key={`${category.name}-${category.title}`}
          className="border border-border-base bg-surface rounded overflow-hidden"
          open={index < 3}
        >
          <summary className="cursor-pointer list-none px-4 py-3 flex items-center justify-between gap-3 hover:bg-surface-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-text">
              {category.title}
            </span>
            <span className="font-mono text-[10px] text-text-muted">
              {category.rows.length} rows
            </span>
          </summary>
          <StatsTable kind={kind} valueLabel={category.valueLabel} rows={category.rows} />
        </details>
      ))}
    </div>
  );
}

function pickPlayerCategories(categories: StatsCategory[]) {
  const wanted = new Set(["goals", "goal_assist"]);
  return categories.filter((category) => wanted.has(category.name));
}

function GroupTables({ groups }: { groups: GroupTable[] }) {
  if (groups.length === 0) {
    return (
      <div className="rounded border border-border-base bg-surface p-5 text-sm text-text-muted">
        No cached group tables yet.
      </div>
    );
  }

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {groups.map((group) => (
        <div key={group.name} className="border border-border-base bg-surface rounded overflow-x-auto">
          <div className="px-3 py-2 border-b border-border-base font-mono text-[10px] uppercase tracking-[0.12em] text-text">
            {group.name}
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted border-b border-border-base">
                <th className="px-3 py-2 text-left">#</th>
                <th className="px-3 py-2 text-left">Team</th>
                <th className="px-3 py-2 text-right">P</th>
                <th className="px-3 py-2 text-right">W</th>
                <th className="px-3 py-2 text-right">D</th>
                <th className="px-3 py-2 text-right">L</th>
                <th className="px-3 py-2 text-right">GD</th>
                <th className="px-3 py-2 text-right">Pts</th>
              </tr>
            </thead>
            <tbody>
              {group.rows.map((row) => (
                <tr
                  key={`${group.name}-${row.rank}-${row.name}`}
                  className="border-b border-border-base/50 last:border-0 hover:bg-surface-2"
                >
                  <td className="px-3 py-2 font-mono text-text-muted">{row.rank}</td>
                  <td className="px-3 py-2 text-text whitespace-nowrap">{row.name}</td>
                  <td className="px-3 py-2 text-right font-mono text-text-muted">{row.played}</td>
                  <td className="px-3 py-2 text-right font-mono text-text-muted">{row.wins}</td>
                  <td className="px-3 py-2 text-right font-mono text-text-muted">{row.draws}</td>
                  <td className="px-3 py-2 text-right font-mono text-text-muted">{row.losses}</td>
                  <td className="px-3 py-2 text-right font-mono text-text-muted">{row.goalConDiff}</td>
                  <td className="px-3 py-2 text-right font-mono text-text">{row.pts}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

export async function FullStatsPage() {
  await requireUser();
  const stats = await loadQualificationStats();

  return (
    <div className="space-y-8">
      <header className="pb-7 border-b border-border-base flex items-end justify-between flex-wrap gap-5">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent mb-2">
            Qualification
          </div>
          <h1 className="font-display text-[clamp(40px,6vw,80px)] leading-[0.9]">
            Stats
          </h1>
          <p className="text-xs text-text-muted mt-3 leading-relaxed max-w-prose">
            {stats
              ? `Cached ${fmtUtc(stats.fetchedAt)}`
              : "No cached qualification stats yet."}
          </p>
        </div>
      </header>

      {!stats ? (
        <div className="rounded border border-border-base bg-surface p-8 text-center">
          <div className="font-display text-2xl text-text">Waiting on first refresh</div>
        </div>
      ) : (
        QUALIFICATION_COMPETITIONS.map((competition) => {
          const item = stats.competitions.find((c) => c.competition === competition);
          return (
            <section key={competition} className="space-y-4">
              <div className="flex items-baseline justify-between gap-3 flex-wrap">
                <div>
                  <h2 className="font-display text-3xl text-text">{competition}</h2>
                  {item ? (
                    <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted mt-1">
                      {item.matchesCount} qualification matches in source
                    </p>
                  ) : null}
                </div>
                {item?.error ? (
                  <span className="font-mono text-[10px] text-danger">{item.error}</span>
                ) : null}
              </div>
              <div className="space-y-2">
                <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted">
                  Group tables
                </div>
                <GroupTables groups={item?.groups ?? []} />
              </div>
              <div className="grid gap-5 2xl:grid-cols-2">
                <div className="space-y-2">
                  <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted">
                    Player categories
                  </div>
                  <CategoryList kind="players" categories={item?.playerCategories ?? []} />
                </div>
                <div className="space-y-2">
                  <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted">
                    Team categories
                  </div>
                  <CategoryList kind="teams" categories={item?.teamCategories ?? []} />
                </div>
              </div>
            </section>
          );
        })
      )}
    </div>
  );
}

export default async function StatsPage() {
  await requireUser();
  const stats = await loadQualificationStats();

  return (
    <div className="space-y-8">
      <header className="pb-7 border-b border-border-base flex items-end justify-between flex-wrap gap-5">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent mb-2">
            Qualification
          </div>
          <h1 className="font-display text-[clamp(40px,6vw,80px)] leading-[0.9]">
            Stats
          </h1>
          <p className="text-xs text-text-muted mt-3 leading-relaxed max-w-prose">
            {stats
              ? `Cached ${fmtUtc(stats.fetchedAt)}`
              : "No cached qualification stats yet."}
          </p>
        </div>
      </header>

      {!stats ? (
        <div className="rounded border border-border-base bg-surface p-8 text-center">
          <div className="font-display text-2xl text-text">Waiting on first refresh</div>
        </div>
      ) : (
        QUALIFICATION_COMPETITIONS.map((competition) => {
          const item = stats.competitions.find((c) => c.competition === competition);
          const playerCategories = pickPlayerCategories(item?.playerCategories ?? []);

          return (
            <section key={competition} className="space-y-4">
              <div className="flex items-baseline justify-between gap-3 flex-wrap">
                <div>
                  <h2 className="font-display text-3xl text-text">{competition}</h2>
                  {item ? (
                    <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted mt-1">
                      {item.matchesCount} qualification matches in source
                    </p>
                  ) : null}
                </div>
                {item?.error ? (
                  <span className="font-mono text-[10px] text-danger">{item.error}</span>
                ) : null}
              </div>

              <div className="space-y-2">
                <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted">
                  Group tables
                </div>
                <GroupTables groups={item?.groups ?? []} />
              </div>

              <div className="space-y-2">
                <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted">
                  Player goals and assists
                </div>
                <CategoryList kind="players" categories={playerCategories} />
              </div>
            </section>
          );
        })
      )}
    </div>
  );
}
