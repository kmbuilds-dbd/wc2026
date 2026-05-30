import { getDb } from "@/db/client";
import { oddsSnapshots } from "@/db/schema";
import {
  fetchKalshiSeries,
  KALSHI_SERIES,
  oddsSnapshotMarketKey,
} from "./kalshi";

export interface RefreshOddsResult {
  fetched: number;
  marketsSaved: string[];
  snapshotAt: number;
}

export async function refreshOdds(): Promise<RefreshOddsResult> {
  const snapshotAt = Math.floor(Date.now() / 1000);
  const db = await getDb();
  let fetched = 0;
  const marketsSaved: string[] = [];

  for (const series of KALSHI_SERIES) {
    const snapshot = await fetchKalshiSeries(series);
    fetched += snapshot.markets.length;
    const market = oddsSnapshotMarketKey(series.ticker);
    await db
      .insert(oddsSnapshots)
      .values({ market, snapshotAt, payload: snapshot })
      .onConflictDoUpdate({
        target: [oddsSnapshots.market, oddsSnapshots.snapshotAt],
        set: { payload: snapshot },
      });
    marketsSaved.push(market);
  }

  return { fetched, marketsSaved, snapshotAt };
}
