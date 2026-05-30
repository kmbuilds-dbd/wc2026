import { sql } from "drizzle-orm";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { PageHeader } from "@/components/page-header";
import { getDb } from "@/db/client";
import { oddsSnapshots } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import {
  isKalshiSeriesSnapshot,
  KALSHI_SERIES,
  oddsSnapshotMarketKey,
  type KalshiMarket,
  type KalshiSeriesSnapshot,
} from "@/lib/odds/kalshi";

export const metadata = {
  title: "World Cup odds — WC2026 pick'em",
};

type LoadedSnapshot = {
  snapshotAt: number | null;
  payload: KalshiSeriesSnapshot;
};

const TEAM_FINISH = ["KXMENWORLDCUP", "KXWCROUND", "KXWCSTAGEOFELIM"];

function fmtUtc(sec: number | null): string {
  if (!sec) return "live fallback";
  return new Date(sec * 1000).toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

function fmtPrice(value: number | null): string {
  if (value === null) return "—";
  return `${Math.round(value * 100)}¢`;
}

function fmtPercent(value: number | null): string {
  if (value === null) return "—";
  return `${(value * 100).toFixed(value >= 0.1 ? 0 : 1)}%`;
}

function fmtNumber(value: number | null): string {
  if (value === null) return "—";
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toFixed(0);
}

function priceOf(market: KalshiMarket): number {
  return market.yesAsk ?? market.lastPrice ?? market.yesBid ?? 0;
}

function activeMarkets(snapshot: KalshiSeriesSnapshot): KalshiMarket[] {
  return snapshot.markets.filter((m) => m.status === "active");
}

function favorites(markets: KalshiMarket[], limit: number): KalshiMarket[] {
  return [...markets].sort((a, b) => priceOf(b) - priceOf(a)).slice(0, limit);
}

function byTicker(snapshots: LoadedSnapshot[]): Map<string, LoadedSnapshot> {
  return new Map(snapshots.map((s) => [s.payload.seriesTicker, s]));
}

function groupLetter(market: KalshiMarket): string {
  return market.ticker.match(/-26([A-L])-/)?.[1] ?? "?";
}

function awardName(market: KalshiMarket): string {
  return market.title.match(/win the (.+?)\?/)?.[1] ?? "Awards";
}

async function loadSnapshots(): Promise<LoadedSnapshot[]> {
  const db = await getDb();
  const latestRows = await db
    .select({
      market: oddsSnapshots.market,
      snapshotAt: sql<number>`max(${oddsSnapshots.snapshotAt})`,
    })
    .from(oddsSnapshots)
    .groupBy(oddsSnapshots.market);

  const fullRows = await db.select().from(oddsSnapshots);
  const snapshots: LoadedSnapshot[] = [];

  for (const series of KALSHI_SERIES) {
    const market = oddsSnapshotMarketKey(series.ticker);
    const latest = latestRows.find((r) => r.market === market);
    const full = latest
      ? fullRows.find((r) => r.market === market && r.snapshotAt === latest.snapshotAt)
      : null;
    if (full && isKalshiSeriesSnapshot(full.payload)) {
      snapshots.push({ snapshotAt: full.snapshotAt, payload: full.payload });
    }
  }

  return snapshots;
}

export default async function OddsPage() {
  const user = await requireUser();
  const { env } = await getCloudflareContext({ async: true });
  const isAdmin = env.ADMIN_EMAIL?.toLowerCase() === user.email.toLowerCase();
  const snapshots = await loadSnapshots();
  const map = byTicker(snapshots);
  const lastRefresh = snapshots.reduce<number | null>(
    (max, item) =>
      item.snapshotAt && (max === null || item.snapshotAt > max) ? item.snapshotAt : max,
    null,
  );
  const activeCount = snapshots.reduce((sum, s) => sum + activeMarkets(s.payload).length, 0);
  const totalCount = snapshots.reduce((sum, s) => sum + s.payload.markets.length, 0);
  const isEmpty = snapshots.length === 0;

  return (
    <>
      <PageHeader
        eyebrow="Kalshi public market data · read-only"
        title="World Cup"
        highlight="odds"
        subtitle="Team futures, group-stage contracts, and player markets. Prices are YES contract prices, so 72¢ roughly means a 72% market-implied chance before fees and spread."
      >
        <div className="font-mono text-[10px] text-text-muted text-right leading-relaxed">
          Last snapshot
          <br />
          <span className="text-text">{fmtUtc(lastRefresh)}</span>
        </div>
      </PageHeader>

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        <Metric label="Active contracts" value={activeCount.toLocaleString()} />
        <Metric label="Total tracked" value={totalCount.toLocaleString()} />
        <Metric label="Series" value={snapshots.length.toString()} />
        <Metric label="Source cost" value="Free public" />
      </section>

      {isEmpty ? (
        <EmptyState isAdmin={isAdmin} />
      ) : (
        <>
          <MarketBand
            title="Team Finishes"
            subtitle="Champion, round reached, and exact stage of elimination."
            snapshots={
              TEAM_FINISH.map((ticker) => map.get(ticker)).filter(Boolean) as LoadedSnapshot[]
            }
          />

          <GroupStageSection map={map} />

          <PlayerSection map={map} />
        </>
      )}
    </>
  );
}

function EmptyState({ isAdmin }: { isAdmin: boolean }) {
  return (
    <div className="rounded border border-border-base bg-surface p-8 text-center">
      <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-text-muted mb-2">
        No Kalshi snapshot yet
      </div>
      <div className="font-display text-2xl text-text">Waiting on first odds refresh</div>
      {isAdmin ? (
        <div className="text-xs text-text-muted mt-2 max-w-lg mx-auto leading-relaxed">
          The page reads cached Kalshi snapshots from D1. Use the admin console to POST to{" "}
          <code className="text-accent">/api/cron/refresh-odds</code>.
        </div>
      ) : null}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-border-base bg-surface px-4 py-3">
      <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-text-muted">
        {label}
      </div>
      <div className="font-display text-3xl leading-none text-text mt-1">{value}</div>
    </div>
  );
}

function MarketBand({
  title,
  subtitle,
  snapshots,
}: {
  title: string;
  subtitle: string;
  snapshots: LoadedSnapshot[];
}) {
  return (
    <section className="mb-10">
      <SectionTitle title={title} subtitle={subtitle} />
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {snapshots.map((snapshot) => (
          <SeriesCard key={snapshot.payload.seriesTicker} snapshot={snapshot} />
        ))}
      </div>
    </section>
  );
}

function GroupStageSection({ map }: { map: Map<string, LoadedSnapshot> }) {
  const winner = map.get("KXWCGROUPWIN");
  const qualify = map.get("KXWCGROUPQUAL");
  const order = map.get("KXWCGROUPORDER");
  const teamGoals = map.get("KXWCTEAMGOALS");
  const totalGoals = map.get("KXWCTOTALGOAL");

  return (
    <section className="mb-10">
      <SectionTitle
        title="Group Stage"
        subtitle="Group winners, qualifiers, exact ordering, and group-stage goal thresholds."
      />
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-4">
        {winner && <GroupGrid title="Group Winners" snapshot={winner} />}
        {qualify && <GroupGrid title="Qualify From Group" snapshot={qualify} />}
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {order && <SeriesCard snapshot={order} maxRows={8} />}
        {teamGoals && <SeriesCard snapshot={teamGoals} maxRows={8} />}
        {totalGoals && <SeriesCard snapshot={totalGoals} maxRows={8} />}
      </div>
    </section>
  );
}

function PlayerSection({ map }: { map: Map<string, LoadedSnapshot> }) {
  const goalLeader = map.get("KXWCGOALLEADER");
  const awards = map.get("KXWCAWARD");
  const squad = map.get("KXWCSQUAD");

  return (
    <section className="mb-10">
      <SectionTitle
        title="Player Markets"
        subtitle="Golden Boot, awards, and final squad selection contracts."
      />
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {goalLeader && <SeriesCard snapshot={goalLeader} maxRows={12} />}
        {awards && <AwardsCard snapshot={awards} />}
        {squad && <SeriesCard snapshot={squad} maxRows={12} />}
      </div>
    </section>
  );
}

function SectionTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-4">
      <h2 className="font-display text-3xl text-text leading-none">{title}</h2>
      <p className="text-xs text-text-muted mt-1">{subtitle}</p>
    </div>
  );
}

function SeriesCard({
  snapshot,
  maxRows = 10,
}: {
  snapshot: LoadedSnapshot;
  maxRows?: number;
}) {
  const active = activeMarkets(snapshot.payload);
  const rows = favorites(active.length ? active : snapshot.payload.markets, maxRows);

  return (
    <article className="rounded border border-border-base bg-surface overflow-hidden">
      <div className="px-4 py-3 border-b border-border-base bg-surface-2/60">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-display text-2xl leading-none text-text">
              {snapshot.payload.label}
            </h3>
            <p className="text-[11px] text-text-muted mt-1 leading-relaxed">
              {snapshot.payload.description}
            </p>
          </div>
          <div className="font-mono text-[10px] text-right text-text-muted shrink-0">
            {active.length} active
            <br />
            {fmtUtc(snapshot.snapshotAt)}
          </div>
        </div>
      </div>
      <MarketTable rows={rows} />
    </article>
  );
}

function GroupGrid({ title, snapshot }: { title: string; snapshot: LoadedSnapshot }) {
  const groups = new Map<string, KalshiMarket[]>();
  for (const market of activeMarkets(snapshot.payload)) {
    const group = groupLetter(market);
    groups.set(group, [...(groups.get(group) ?? []), market]);
  }

  return (
    <article className="rounded border border-border-base bg-surface p-4">
      <div className="flex items-end justify-between gap-3 mb-3">
        <div>
          <h3 className="font-display text-2xl leading-none text-text">{title}</h3>
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-muted mt-1">
            {snapshot.payload.seriesTicker}
          </p>
        </div>
        <div className="font-mono text-[10px] text-text-muted">{fmtUtc(snapshot.snapshotAt)}</div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {Array.from(groups.entries())
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([group, rows]) => (
            <div key={group} className="border border-border-base rounded bg-bg/30 p-3">
              <div className="font-display text-xl text-accent leading-none mb-2">
                Group {group}
              </div>
              <MarketMiniTable rows={favorites(rows, 6)} />
            </div>
          ))}
      </div>
    </article>
  );
}

function AwardsCard({ snapshot }: { snapshot: LoadedSnapshot }) {
  const groups = new Map<string, KalshiMarket[]>();
  for (const market of activeMarkets(snapshot.payload)) {
    const award = awardName(market);
    groups.set(award, [...(groups.get(award) ?? []), market]);
  }

  return (
    <article className="rounded border border-border-base bg-surface overflow-hidden">
      <div className="px-4 py-3 border-b border-border-base bg-surface-2/60">
        <h3 className="font-display text-2xl leading-none text-text">Awards</h3>
        <p className="text-[11px] text-text-muted mt-1">
          Top priced contracts by award category.
        </p>
      </div>
      <div className="divide-y divide-border-base">
        {Array.from(groups.entries()).map(([award, rows]) => (
          <div key={award} className="p-3">
            <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-accent mb-2">
              {award}
            </div>
            <MarketMiniTable rows={favorites(rows, 4)} />
          </div>
        ))}
      </div>
    </article>
  );
}

function MarketTable({ rows }: { rows: KalshiMarket[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted border-b border-border-base">
            <th className="text-left px-4 py-2.5">Contract</th>
            <th className="text-right px-4 py-2.5">Ask</th>
            <th className="text-right px-4 py-2.5 hidden sm:table-cell">Bid</th>
            <th className="text-right px-4 py-2.5 hidden md:table-cell">Last</th>
            <th className="text-right px-4 py-2.5 hidden lg:table-cell">Volume</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.ticker} className="border-b border-border-base/60 last:border-0">
              <td className="px-4 py-3 align-top">
                <div className="text-text leading-snug">{row.title}</div>
                <div className="font-mono text-[10px] text-text-muted mt-1">
                  {row.subtitle ? `${row.subtitle} · ` : ""}
                  {row.status} · closes {fmtDate(row.closeTime)}
                </div>
              </td>
              <td className="px-4 py-3 text-right align-top">
                <div className="font-mono text-accent">{fmtPrice(row.yesAsk)}</div>
                <div className="font-mono text-[10px] text-text-muted">
                  {fmtPercent(row.yesAsk)}
                </div>
              </td>
              <td className="px-4 py-3 text-right font-mono text-text-muted hidden sm:table-cell align-top">
                {fmtPrice(row.yesBid)}
              </td>
              <td className="px-4 py-3 text-right font-mono text-text-muted hidden md:table-cell align-top">
                {fmtPrice(row.lastPrice)}
              </td>
              <td className="px-4 py-3 text-right font-mono text-text-muted hidden lg:table-cell align-top">
                {fmtNumber(row.volume)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MarketMiniTable({ rows }: { rows: KalshiMarket[] }) {
  return (
    <table className="w-full text-xs">
      <tbody>
        {rows.map((row) => (
          <tr key={row.ticker} className="border-b border-border-base/40 last:border-0">
            <td className="py-1.5 pr-2 text-text leading-snug">{shortTitle(row)}</td>
            <td className="py-1.5 text-right font-mono text-accent w-12">
              {fmtPrice(row.yesAsk)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function shortTitle(row: KalshiMarket): string {
  const stripped = row.title
    .replace(/^Will /, "")
    .replace(/\?$/, "")
    .replace(" in the 2026 Men's FIFA World Cup", "")
    .replace(" of the 2026 Men's FIFA World Cup", "")
    .replace(" for the 2026 World Cup Full Tournament", "");
  return row.subtitle && row.subtitle !== "::" ? `${row.subtitle}: ${stripped}` : stripped;
}
