import { sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { oddsSnapshots } from "@/db/schema";
import { playerList, type UiPlayer } from "@/lib/players-data";
import { teamList, type UiTeam } from "@/lib/teams-data";
import {
  isKalshiSeriesSnapshot,
  KALSHI_SERIES,
  oddsSnapshotMarketKey,
  type KalshiMarket,
  type KalshiSeriesSnapshot,
} from "./kalshi";

type LoadedSnapshot = {
  snapshotAt: number | null;
  payload: KalshiSeriesSnapshot;
};

export type OddsPickSuggestions = {
  groupWinners: Record<string, number>;
  groupSecondPlace: Record<string, number>;
  tournament: {
    winnerTeamId: number | null;
    topScorerPlayerId: number | null;
    goldenGlovePlayerId: number | null;
  };
};

const TEAM_ALIASES: Record<string, string[]> = {
  "Bosnia & Herzegovina": ["Bosnia and Herzegovina"],
  "Cape Verde": ["Cabo Verde"],
  "Czech Republic": ["Czechia"],
  "DR Congo": ["Congo DR", "Democratic Republic of Congo", "D.R. Congo"],
  "Ivory Coast": ["Cote d'Ivoire", "Côte d'Ivoire"],
  "South Korea": ["Korea Republic"],
  USA: ["United States", "United States of America", "USMNT"],
};

function normalizeName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase();
}

function priceOf(market: KalshiMarket): number {
  return market.yesAsk ?? market.lastPrice ?? market.yesBid ?? 0;
}

function activeMarkets(snapshot: KalshiSeriesSnapshot): KalshiMarket[] {
  return snapshot.markets.filter((m) => m.status === "active");
}

function bestFirst(markets: KalshiMarket[]): KalshiMarket[] {
  return [...markets].sort((a, b) => priceOf(b) - priceOf(a));
}

function groupLetter(market: KalshiMarket): string | null {
  return market.ticker.match(/-26([A-L])-/)?.[1] ?? null;
}

function marketText(market: KalshiMarket): string {
  return `${market.title} ${market.subtitle ?? ""}`;
}

function matchTeam(market: KalshiMarket): UiTeam | null {
  const text = normalizeName(marketText(market));
  const candidates = teamList
    .flatMap((team) => [
      { team, name: team.name },
      ...(TEAM_ALIASES[team.name] ?? []).map((name) => ({ team, name })),
    ])
    .sort((a, b) => b.name.length - a.name.length);

  return candidates.find((candidate) => text.includes(normalizeName(candidate.name)))?.team ?? null;
}

function matchPlayer(market: KalshiMarket, players: UiPlayer[]): UiPlayer | null {
  const text = normalizeName(marketText(market));
  const candidates = [...players].sort((a, b) => b.name.length - a.name.length);
  return candidates.find((player) => text.includes(normalizeName(player.name))) ?? null;
}

async function loadLatestSnapshots(): Promise<LoadedSnapshot[]> {
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

function snapshotByTicker(snapshots: LoadedSnapshot[], ticker: string) {
  return snapshots.find((snapshot) => snapshot.payload.seriesTicker === ticker)?.payload ?? null;
}

function bestTeam(snapshot: KalshiSeriesSnapshot | null, excludedTeamIds = new Set<number>()): number | null {
  if (!snapshot) return null;
  for (const market of bestFirst(activeMarkets(snapshot))) {
    const team = matchTeam(market);
    if (team && !excludedTeamIds.has(team.id)) return team.id;
  }
  return null;
}

function bestPlayer(snapshot: KalshiSeriesSnapshot | null, players: UiPlayer[]): number | null {
  if (!snapshot) return null;
  for (const market of bestFirst(activeMarkets(snapshot))) {
    const player = matchPlayer(market, players);
    if (player) return player.id;
  }
  return null;
}

export async function loadOddsPickSuggestions(): Promise<OddsPickSuggestions> {
  const snapshots = await loadLatestSnapshots();
  const groupWinnerSnapshot = snapshotByTicker(snapshots, "KXWCGROUPWIN");
  const groupQualifierSnapshot = snapshotByTicker(snapshots, "KXWCGROUPQUAL");
  const groupWinners: Record<string, number> = {};
  const groupSecondPlace: Record<string, number> = {};

  if (groupWinnerSnapshot) {
    const byGroup = new Map<string, KalshiMarket[]>();
    for (const market of activeMarkets(groupWinnerSnapshot)) {
      const group = groupLetter(market);
      if (!group) continue;
      byGroup.set(group, [...(byGroup.get(group) ?? []), market]);
    }

    for (const [group, markets] of byGroup) {
      const teamId = bestTeam({ ...groupWinnerSnapshot, markets });
      if (teamId !== null) groupWinners[group] = teamId;
    }
  }

  if (groupQualifierSnapshot) {
    const byGroup = new Map<string, KalshiMarket[]>();
    for (const market of activeMarkets(groupQualifierSnapshot)) {
      const group = groupLetter(market);
      if (!group) continue;
      byGroup.set(group, [...(byGroup.get(group) ?? []), market]);
    }

    for (const [group, markets] of byGroup) {
      const excluded = groupWinners[group] ? new Set([groupWinners[group]]) : new Set<number>();
      const teamId = bestTeam({ ...groupQualifierSnapshot, markets }, excluded);
      if (teamId !== null) groupSecondPlace[group] = teamId;
    }
  }

  const awardsSnapshot = snapshotByTicker(snapshots, "KXWCAWARD");
  const goldenGloveMarkets = awardsSnapshot
    ? activeMarkets(awardsSnapshot).filter((market) =>
        normalizeName(marketText(market)).includes("golden glove"),
      )
    : [];

  return {
    groupWinners,
    groupSecondPlace,
    tournament: {
      winnerTeamId: bestTeam(snapshotByTicker(snapshots, "KXMENWORLDCUP")),
      topScorerPlayerId: bestPlayer(snapshotByTicker(snapshots, "KXWCGOALLEADER"), playerList),
      goldenGlovePlayerId: bestPlayer(
        awardsSnapshot ? { ...awardsSnapshot, markets: goldenGloveMarkets } : null,
        playerList.filter((player) => player.position === "GK"),
      ),
    },
  };
}
