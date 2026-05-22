/**
 * Pull WC 2026 outright odds from The Odds API and persist them as
 * `odds_snapshots` rows keyed by our internal market name.
 *
 * The Odds API exposes each tournament outright as its OWN sport key (not as
 * a market on the base soccer_fifa_world_cup sport). We fan out over the
 * map below, one HTTP request per sport key.
 *
 * Idempotent per (market, snapshot_at). Repeated calls within the same
 * second update the row in place.
 *
 * To add a market: confirm its sport key exists with /api/admin/odds-probe,
 * then add it to SPORT_KEY_TO_MARKET. As of 2026-05-21 The Odds API has only
 * published `soccer_fifa_world_cup_winner`; top-scorer and group-winner keys
 * may appear closer to kickoff.
 */
import { getDb } from "@/db/client";
import { oddsSnapshots } from "@/db/schema";
import { fetchOutrightsForSport } from "./client";

const SPORT_KEY_TO_MARKET: Record<string, string> = {
  soccer_fifa_world_cup_winner: "tournament_winner",
};

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

  for (const [sportKey, market] of Object.entries(SPORT_KEY_TO_MARKET)) {
    const events = await fetchOutrightsForSport(sportKey);
    if (events.length === 0) continue;
    fetched += events.length;
    for (const ev of events) {
      await db
        .insert(oddsSnapshots)
        .values({ market, snapshotAt, payload: ev })
        .onConflictDoUpdate({
          target: [oddsSnapshots.market, oddsSnapshots.snapshotAt],
          set: { payload: ev },
        });
    }
    marketsSaved.push(market);
  }

  return { fetched, marketsSaved, snapshotAt };
}
