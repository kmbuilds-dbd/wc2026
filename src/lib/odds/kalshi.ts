export const KALSHI_BASE_URL = "https://external-api.kalshi.com/trade-api/v2";

export const KALSHI_SERIES = [
  {
    ticker: "KXMENWORLDCUP",
    label: "Tournament winner",
    bucket: "team_finish",
    description: "Outright champion contracts by team.",
  },
  {
    ticker: "KXWCROUND",
    label: "Reach round",
    bucket: "team_finish",
    description: "Team reaches Round of 16, quarterfinal, semifinal, or final.",
  },
  {
    ticker: "KXWCSTAGEOFELIM",
    label: "Stage of elimination",
    bucket: "team_finish",
    description: "Team eliminated in group stage, knockout rounds, final, or wins final.",
  },
  {
    ticker: "KXWCGROUPWIN",
    label: "Group winner",
    bucket: "group_stage",
    description: "Team finishes first in its World Cup group.",
  },
  {
    ticker: "KXWCGROUPQUAL",
    label: "Qualify from group",
    bucket: "group_stage",
    description: "Team advances from its World Cup group.",
  },
  {
    ticker: "KXWCGROUPORDER",
    label: "Exact group order",
    bucket: "group_stage",
    description: "Exact four-team group standings order.",
  },
  {
    ticker: "KXWCTEAMGOALS",
    label: "Team group goals",
    bucket: "group_stage",
    description: "Team reaches a group-stage goals threshold.",
  },
  {
    ticker: "KXWCTOTALGOAL",
    label: "Group total goals",
    bucket: "group_stage",
    description: "All teams in a group reach a collective goals threshold.",
  },
  {
    ticker: "KXWCGOALLEADER",
    label: "Golden Boot",
    bucket: "player",
    description: "Player leads the tournament in goals.",
  },
  {
    ticker: "KXWCAWARD",
    label: "Awards",
    bucket: "player",
    description: "Golden Ball, Golden Glove, Young Player, Fair Play, and related awards.",
  },
  {
    ticker: "KXWCSQUAD",
    label: "Final squad",
    bucket: "player",
    description: "Player makes a national team's final World Cup squad.",
  },
] as const;

export type KalshiBucket = (typeof KALSHI_SERIES)[number]["bucket"];

export interface KalshiApiMarket {
  ticker: string;
  event_ticker: string;
  title: string;
  subtitle?: string;
  yes_sub_title?: string;
  no_sub_title?: string;
  status: string;
  open_time?: string;
  close_time?: string;
  expiration_time?: string;
  yes_bid_dollars?: string;
  yes_ask_dollars?: string;
  last_price_dollars?: string;
  volume_fp?: string;
  open_interest_fp?: string;
  liquidity_dollars?: string;
}

interface KalshiMarketsResponse {
  markets?: KalshiApiMarket[];
  cursor?: string;
  error?: string;
  message?: string;
}

export interface KalshiMarket {
  ticker: string;
  eventTicker: string;
  title: string;
  subtitle: string | null;
  status: string;
  yesBid: number | null;
  yesAsk: number | null;
  lastPrice: number | null;
  volume: number | null;
  liquidity: number | null;
  closeTime: string | null;
  sortKey: number;
}

export interface KalshiSeriesSnapshot {
  source: "kalshi";
  seriesTicker: string;
  label: string;
  bucket: KalshiBucket;
  description: string;
  fetchedAt: string;
  markets: KalshiMarket[];
}

export class KalshiApiError extends Error {
  constructor(
    message: string,
    public status?: number,
    public body?: string,
  ) {
    super(message);
    this.name = "KalshiApiError";
  }
}

function moneyToNumber(value: string | undefined): number | null {
  if (!value) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeMarket(market: KalshiApiMarket): KalshiMarket {
  const yesBid = moneyToNumber(market.yes_bid_dollars);
  const yesAsk = moneyToNumber(market.yes_ask_dollars);
  const lastPrice = moneyToNumber(market.last_price_dollars);
  const volume = moneyToNumber(market.volume_fp);
  const liquidity = moneyToNumber(market.liquidity_dollars);
  const sortKey = yesAsk ?? lastPrice ?? yesBid ?? 1;

  return {
    ticker: market.ticker,
    eventTicker: market.event_ticker,
    title: market.title,
    subtitle: market.subtitle || market.yes_sub_title || null,
    status: market.status,
    yesBid,
    yesAsk,
    lastPrice,
    volume,
    liquidity,
    closeTime: market.close_time || market.expiration_time || null,
    sortKey,
  };
}

export function oddsSnapshotMarketKey(seriesTicker: string): string {
  return `kalshi:${seriesTicker}`;
}

export async function fetchKalshiSeries(
  series: (typeof KALSHI_SERIES)[number],
): Promise<KalshiSeriesSnapshot> {
  const url = new URL(`${KALSHI_BASE_URL}/markets`);
  url.searchParams.set("series_ticker", series.ticker);
  url.searchParams.set("limit", "1000");

  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    next: { revalidate: 15 * 60 },
  });
  const body = await res.text();

  if (!res.ok) {
    throw new KalshiApiError(
      `kalshi ${res.status} for ${series.ticker}`,
      res.status,
      body.slice(0, 1000),
    );
  }

  let payload: KalshiMarketsResponse;
  try {
    payload = JSON.parse(body) as KalshiMarketsResponse;
  } catch {
    throw new KalshiApiError(`kalshi returned invalid JSON for ${series.ticker}`, res.status, body);
  }

  if (payload.error || payload.message) {
    throw new KalshiApiError(
      payload.error || payload.message || `kalshi error for ${series.ticker}`,
      res.status,
      body.slice(0, 1000),
    );
  }

  const markets = (payload.markets ?? [])
    .map(normalizeMarket)
    .sort((a, b) => {
      if (a.status === "active" && b.status !== "active") return -1;
      if (a.status !== "active" && b.status === "active") return 1;
      return a.sortKey - b.sortKey;
    });

  return {
    source: "kalshi",
    seriesTicker: series.ticker,
    label: series.label,
    bucket: series.bucket,
    description: series.description,
    fetchedAt: new Date().toISOString(),
    markets,
  };
}

export function isKalshiSeriesSnapshot(value: unknown): value is KalshiSeriesSnapshot {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<KalshiSeriesSnapshot>;
  return candidate.source === "kalshi" && Array.isArray(candidate.markets);
}
