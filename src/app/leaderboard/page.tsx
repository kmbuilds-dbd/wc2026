import { sql } from "drizzle-orm";
import { PageHeader } from "@/components/page-header";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/db/client";
import { leaderboardRows } from "@/lib/scoring/apply";
import { scores } from "@/db/schema";

export const metadata = {
  title: "Leaderboard — WC2026 pick'em",
};

function fmtTime(unix: number | null): string {
  if (!unix) return "—";
  return new Date(unix * 1000).toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

export default async function LeaderboardPage() {
  await requireUser();
  const db = await getDb();
  const rows = await leaderboardRows();

  // Per-category breakdown so leaders can see where points came from.
  const byCategory = await db
    .select({
      userEmail: scores.userEmail,
      category: scores.category,
      points: sql<number>`coalesce(sum(${scores.points}), 0)`,
    })
    .from(scores)
    .groupBy(scores.userEmail, scores.category);

  const breakdownByEmail = new Map<string, Record<string, number>>();
  for (const r of byCategory) {
    const m = breakdownByEmail.get(r.userEmail) ?? {};
    m[r.category] = r.points;
    breakdownByEmail.set(r.userEmail, m);
  }

  const lastComputed = rows
    .map((r) => r.lastComputed)
    .filter((t): t is number => t !== null)
    .reduce<number | null>((max, t) => (max === null || t > max ? t : max), null);

  return (
    <>
      <PageHeader
        eyebrow={`${rows.length} player${rows.length === 1 ? "" : "s"} · re-scored on every match`}
        title="Leader"
        highlight="board"
        subtitle="Group + wildcard + bracket + tournament. Sortable by clicking column headers (coming soon)."
      >
        <div className="font-mono text-[10px] text-text-muted text-right leading-relaxed">
          Last computed
          <br />
          <span className="text-text">{fmtTime(lastComputed)}</span>
        </div>
      </PageHeader>

      {rows.length === 0 ? (
        <div className="rounded border border-border-base bg-surface p-8 text-center">
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-text-muted mb-2">
            No scores yet
          </div>
          <div className="font-display text-2xl text-text">Waiting on first match</div>
          <div className="text-xs text-text-muted mt-2 max-w-md mx-auto">
            Scores appear once an admin records a finished match result. Until then
            everyone&apos;s on 0.
          </div>
        </div>
      ) : (
        <div className="border border-border-base bg-surface rounded overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted border-b border-border-base">
                <th className="text-left px-4 py-2.5 w-8">#</th>
                <th className="text-left px-4 py-2.5">Player</th>
                <th className="hidden md:table-cell text-right px-4 py-2.5">Group</th>
                <th className="hidden md:table-cell text-right px-4 py-2.5">Wildcard</th>
                <th className="hidden md:table-cell text-right px-4 py-2.5">Bracket</th>
                <th className="hidden lg:table-cell text-right px-4 py-2.5">Tournament</th>
                <th className="hidden lg:table-cell text-right px-4 py-2.5">Lineup</th>
                <th className="text-right px-4 py-2.5 text-accent">Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const breakdown = breakdownByEmail.get(row.userEmail) ?? {};
                return (
                  <tr
                    key={row.userEmail}
                    className="border-b border-border-base/50 last:border-0 hover:bg-surface-2"
                  >
                    <td className="px-4 py-2.5 font-mono text-text-muted">
                      {i === 0 ? <span className="text-accent">{i + 1}</span> : i + 1}
                    </td>
                    <td className="px-4 py-2.5">
                      <a
                        href={`/users/${encodeURIComponent(row.userEmail)}`}
                        className="block hover:text-accent"
                      >
                        <div className="font-display text-base text-text">{row.displayName}</div>
                        <div className="font-mono text-[10px] text-text-dim">{row.userEmail}</div>
                      </a>
                    </td>
                    <td className="hidden md:table-cell px-4 py-2.5 text-right font-mono text-text-muted">
                      {breakdown.group ?? 0}
                    </td>
                    <td className="hidden md:table-cell px-4 py-2.5 text-right font-mono text-text-muted">
                      {breakdown.wildcard ?? 0}
                    </td>
                    <td className="hidden md:table-cell px-4 py-2.5 text-right font-mono text-text-muted">
                      {breakdown.bracket ?? 0}
                    </td>
                    <td className="hidden lg:table-cell px-4 py-2.5 text-right font-mono text-text-muted">
                      {breakdown.tournament ?? 0}
                    </td>
                    <td className="hidden lg:table-cell px-4 py-2.5 text-right font-mono text-text-muted">
                      {breakdown.lineup ?? 0}
                    </td>
                    <td className="px-4 py-2.5 text-right font-display text-xl text-accent">
                      {row.points}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-6 rounded border border-border-base bg-surface px-4 py-3 font-mono text-[10px] uppercase tracking-[0.1em] text-text-muted">
        How scoring works → see{" "}
        <a
          href="https://github.com/kmbuilds-dbd/wc2026/blob/main/src/lib/scoring/rules.ts"
          target="_blank"
          rel="noopener"
          className="text-accent hover:underline normal-case tracking-normal"
        >
          rules.ts
        </a>{" "}
        · group exact = {} {/* eslint-disable react/no-unescaped-entities */}
        5 pts · wildcard = 5 · R32 = 10 · R16 = 20 · QF = 40 · SF = 80 · Final = 160 · winner /
        top scorer / golden glove = 100 each
      </div>
    </>
  );
}
