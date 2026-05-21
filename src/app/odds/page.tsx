import { sql } from "drizzle-orm";
import { PageHeader } from "@/components/page-header";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/db/client";
import { oddsSnapshots } from "@/db/schema";
import type { OddsApiEvent } from "@/lib/odds/types";

export const metadata = {
  title: "Live odds — WC2026 pick'em",
};

function fmtUtc(sec: number): string {
  return new Date(sec * 1000).toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

/**
 * For a single outright market, collapse all bookmaker outcomes to
 * { outcomeName → bestDecimalOdds, sourceCount }. We surface the best price
 * available across the sampled bookmakers rather than picking one — that's
 * the actually-usable number if a user wanted to place a bet.
 */
function bestOddsByOutcome(ev: OddsApiEvent): Array<{
  name: string;
  best: number;
  bookmakers: number;
}> {
  const map = new Map<string, { best: number; bookmakers: Set<string> }>();
  for (const bm of ev.bookmakers) {
    for (const m of bm.markets) {
      for (const o of m.outcomes) {
        const existing = map.get(o.name);
        if (!existing) {
          map.set(o.name, { best: o.price, bookmakers: new Set([bm.key]) });
        } else {
          if (o.price > existing.best) existing.best = o.price;
          existing.bookmakers.add(bm.key);
        }
      }
    }
  }
  return Array.from(map.entries())
    .map(([name, v]) => ({ name, best: v.best, bookmakers: v.bookmakers.size }))
    .sort((a, b) => a.best - b.best); // lowest decimal = most favored
}

function impliedPercent(decimalOdds: number): string {
  return `${(100 / decimalOdds).toFixed(1)}%`;
}

export default async function OddsPage() {
  await requireUser();
  const db = await getDb();

  // Latest snapshot per market (SQLite: corner-case-safe via window).
  const latestRows = await db
    .select({
      market: oddsSnapshots.market,
      snapshotAt: sql<number>`max(${oddsSnapshots.snapshotAt})`,
    })
    .from(oddsSnapshots)
    .groupBy(oddsSnapshots.market);

  const fullRows = await db.select().from(oddsSnapshots);
  const byMarket = new Map<string, { snapshotAt: number; payload: OddsApiEvent }>();
  for (const r of latestRows) {
    const full = fullRows.find(
      (f) => f.market === r.market && f.snapshotAt === r.snapshotAt,
    );
    if (full) {
      byMarket.set(r.market, {
        snapshotAt: full.snapshotAt,
        payload: full.payload as OddsApiEvent,
      });
    }
  }

  const tournament = byMarket.get("tournament_winner");
  const topScorer = byMarket.get("top_scorer");
  const groupMarkets: Array<{ letter: string; entry: NonNullable<typeof tournament> }> = [];
  for (let i = 0; i < 12; i++) {
    const letter = String.fromCharCode(65 + i);
    const e = byMarket.get(`group_winner:${letter}`);
    if (e) groupMarkets.push({ letter, entry: e });
  }

  const lastRefresh = Array.from(byMarket.values())
    .map((e) => e.snapshotAt)
    .reduce<number | null>((max, t) => (max === null || t > max ? t : max), null);

  const isEmpty = byMarket.size === 0;

  return (
    <>
      <PageHeader
        eyebrow="Refreshed daily · best price across ~14 bookmakers"
        title="Live"
        highlight="odds"
        subtitle="Tournament winner · Golden Boot · group winners. Sourced from The Odds API."
      >
        <div className="font-mono text-[10px] text-text-muted text-right leading-relaxed">
          Last refresh
          <br />
          <span className="text-text">{lastRefresh ? fmtUtc(lastRefresh) : "—"}</span>
        </div>
      </PageHeader>

      {isEmpty ? (
        <div className="rounded border border-border-base bg-surface p-8 text-center">
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-text-muted mb-2">
            No odds snapshot yet
          </div>
          <div className="font-display text-2xl text-text">Waiting on first refresh</div>
          <div className="text-xs text-text-muted mt-2 max-w-md mx-auto">
            Cron fires at 06:00 UTC daily. Admin can trigger an immediate
            refresh by POSTing to <code className="text-accent">/api/cron/refresh-odds</code>{" "}
            with the cron-secret header.
          </div>
        </div>
      ) : (
        <>
          {tournament && <OddsBlock title="Tournament winner" entry={tournament} maxRows={10} />}
          {topScorer && <OddsBlock title="Golden Boot — Top scorer" entry={topScorer} maxRows={15} />}
          {groupMarkets.length > 0 && (
            <section className="mb-10">
              <h2 className="font-display text-2xl text-text mb-1">Group winners</h2>
              <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted mb-4">
                Per-group outright winner odds
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {groupMarkets.map(({ letter, entry }) => (
                  <CompactOddsCard
                    key={letter}
                    title={`Group ${letter}`}
                    entry={entry}
                  />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </>
  );
}

function OddsBlock({
  title,
  entry,
  maxRows,
}: {
  title: string;
  entry: { snapshotAt: number; payload: OddsApiEvent };
  maxRows: number;
}) {
  const rows = bestOddsByOutcome(entry.payload).slice(0, maxRows);
  return (
    <section className="mb-10">
      <div className="flex items-baseline justify-between mb-2">
        <h2 className="font-display text-2xl text-text">{title}</h2>
        <span className="font-mono text-[10px] text-text-dim">
          {rows.length} of {bestOddsByOutcome(entry.payload).length} shown · snapshot{" "}
          {fmtUtc(entry.snapshotAt)}
        </span>
      </div>
      <div className="border border-border-base bg-surface rounded overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted border-b border-border-base">
              <th className="text-left px-4 py-2.5 w-8">#</th>
              <th className="text-left px-4 py-2.5">Outcome</th>
              <th className="text-right px-4 py-2.5">Best odds</th>
              <th className="text-right px-4 py-2.5 hidden sm:table-cell">Implied %</th>
              <th className="text-right px-4 py-2.5 hidden md:table-cell">Books</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr
                key={r.name}
                className="border-b border-border-base/50 last:border-0 hover:bg-surface-2"
              >
                <td className="px-4 py-2 font-mono text-text-muted">{i + 1}</td>
                <td className="px-4 py-2 text-text">{r.name}</td>
                <td className="px-4 py-2 text-right font-mono text-accent">
                  {r.best.toFixed(2)}
                </td>
                <td className="px-4 py-2 text-right font-mono text-text-muted hidden sm:table-cell">
                  {impliedPercent(r.best)}
                </td>
                <td className="px-4 py-2 text-right font-mono text-text-muted hidden md:table-cell">
                  {r.bookmakers}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function CompactOddsCard({
  title,
  entry,
}: {
  title: string;
  entry: { snapshotAt: number; payload: OddsApiEvent };
}) {
  const rows = bestOddsByOutcome(entry.payload);
  return (
    <div className="bg-surface border border-border-base rounded p-3">
      <div className="font-display text-base tracking-[0.1em] text-accent mb-2">
        {title.toUpperCase()}
      </div>
      <table className="w-full text-xs">
        <tbody>
          {rows.map((r) => (
            <tr key={r.name}>
              <td className="text-text py-1">{r.name}</td>
              <td className="text-right font-mono text-accent">{r.best.toFixed(2)}</td>
              <td className="text-right font-mono text-text-muted pl-2 hidden sm:table-cell">
                {impliedPercent(r.best)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
