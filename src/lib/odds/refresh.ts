/**
 * Pull all WC 2026 outright markets from The Odds API and persist them
 * as `odds_snapshots` rows keyed by market.
 *
 * Idempotent per (market, snapshot_at). Repeated calls within the same
 * second skip duplicate inserts but otherwise just append history — the
 * /odds page reads the latest row per market.
 *
 * Market keys:
 *   - "tournament_winner"      → outright "FIFA World Cup Winner"
 *   - "top_scorer"             → outright "FIFA World Cup Top Goalscorer"
 *   - "group_winner:A".."group_winner:L" → 12 group-winner outright markets
 */
import { getDb } from "@/db/client";
import { oddsSnapshots } from "@/db/schema";
import { fetchWcOutrights } from "./client";
import type { OddsApiEvent } from "./types";

export interface RefreshOddsResult {
  fetched: number;
  matched: number;
  unmatched: Array<{ id: string; home: string; away: string }>;
  marketsSaved: string[];
  snapshotAt: number;
}

/** Classify an Odds API event title to one of our internal market keys. */
function classifyEvent(ev: OddsApiEvent): string | null {
  const title = `${ev.home_team} ${ev.away_team}`.toLowerCase();
  if (title.includes("winner") && !title.includes("group")) {
    return "tournament_winner";
  }
  if (title.includes("top goalscorer") || title.includes("top scorer")) {
    return "top_scorer";
  }
  const groupMatch = title.match(/group\s+([a-l])\s+winner/);
  if (groupMatch) return `group_winner:${groupMatch[1].toUpperCase()}`;
  return null;
}

export async function refreshOdds(): Promise<RefreshOddsResult> {
  const events = await fetchWcOutrights();
  const snapshotAt = Math.floor(Date.now() / 1000);

  const matched: Array<{ market: string; payload: OddsApiEvent }> = [];
  const unmatched: RefreshOddsResult["unmatched"] = [];

  for (const ev of events) {
    const market = classifyEvent(ev);
    if (market) matched.push({ market, payload: ev });
    else unmatched.push({ id: ev.id, home: ev.home_team, away: ev.away_team });
  }

  const db = await getDb();
  const marketsSaved: string[] = [];
  for (const { market, payload } of matched) {
    await db
      .insert(oddsSnapshots)
      .values({
        market,
        snapshotAt,
        payload,
      })
      .onConflictDoUpdate({
        target: [oddsSnapshots.market, oddsSnapshots.snapshotAt],
        set: { payload },
      });
    marketsSaved.push(market);
  }

  return {
    fetched: events.length,
    matched: matched.length,
    unmatched,
    marketsSaved,
    snapshotAt,
  };
}
