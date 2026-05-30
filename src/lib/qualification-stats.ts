import { getCloudflareContext } from "@opennextjs/cloudflare";

const FOTMOB_ORIGIN = "https://www.fotmob.com";
const KV_KEY = "qualification-stats:latest";

const COMPETITION_CONFIG = [
  {
    competition: "World Cup Qualification UEFA",
    leagueId: 10195,
    slug: "world-cup-qualification-uefa",
  },
  {
    competition: "World Cup Qualification CONMEBOL",
    leagueId: 10199,
    slug: "world-cup-qualification-conmebol",
  },
  {
    competition: "World Cup Qualification CAF",
    leagueId: 10196,
    slug: "world-cup-qualification-caf",
  },
  {
    competition: "World Cup Qualification CONCACAF",
    leagueId: 10198,
    slug: "world-cup-qualification-concacaf",
  },
  {
    competition: "World Cup Qualification AFC",
    leagueId: 10197,
    slug: "world-cup-qualification-afc",
  },
] as const;

export const QUALIFICATION_COMPETITIONS = COMPETITION_CONFIG.map(
  (config) => config.competition,
);

export type QualificationCompetition = (typeof QUALIFICATION_COMPETITIONS)[number];

export type StatsKind = "players" | "teams";

export type StatsRow = {
  rank: number;
  name: string;
  team?: string;
  values: Record<string, string>;
};

export type StatsCategory = {
  name: string;
  title: string;
  valueLabel: string;
  rows: StatsRow[];
  sourceUrl: string | null;
};

export type GroupTableRow = {
  rank: number;
  name: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  scoresStr: string;
  goalConDiff: number;
  pts: number;
  qualColor?: string | null;
};

export type GroupTable = {
  name: string;
  rows: GroupTableRow[];
};

export type CompetitionStats = {
  competition: QualificationCompetition;
  playerUrl: string | null;
  teamUrl: string | null;
  groups: GroupTable[];
  players: StatsRow[];
  teams: StatsRow[];
  playerCategories: StatsCategory[];
  teamCategories: StatsCategory[];
  matchesCount: number;
  error?: string;
};

export type QualificationStatsPayload = {
  fetchedAt: number;
  competitions: CompetitionStats[];
};

class QualificationStatsError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = "QualificationStatsError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cleanText(value: unknown) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function numberValue(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatStatValue(value: unknown) {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "";
    return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
  }
  if (typeof value === "string") return cleanText(value);
  return "";
}

function statsPageUrl(config: (typeof COMPETITION_CONFIG)[number]) {
  return `${FOTMOB_ORIGIN}/leagues/${config.leagueId}/stats/${config.slug}/players`;
}

function tablePageUrl(config: (typeof COMPETITION_CONFIG)[number]) {
  return `${FOTMOB_ORIGIN}/leagues/${config.leagueId}/table/${config.slug}`;
}

async function fetchText(url: string) {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; WC2026Pickem/1.0; +https://wc2026.followbuilders.workers.dev)",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
  });

  if (!res.ok) {
    throw new QualificationStatsError(`FotMob ${res.status} on ${url}`, res.status);
  }

  return res.text();
}

function parseNextData(html: string, url: string) {
  const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/);
  if (!match) {
    throw new QualificationStatsError(`FotMob page did not include __NEXT_DATA__: ${url}`);
  }

  try {
    return JSON.parse(match[1]) as {
      props?: {
        pageProps?: Record<string, unknown>;
      };
    };
  } catch (e) {
    throw new QualificationStatsError(
      `Could not parse FotMob __NEXT_DATA__ for ${url}: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}

async function fetchFotmobPage(url: string) {
  const html = await fetchText(url);
  const parsed = parseNextData(html, url);
  const pageProps = parsed.props?.pageProps;
  if (!pageProps) {
    throw new QualificationStatsError(`FotMob page had no pageProps: ${url}`);
  }
  return pageProps;
}

function statCategories(pageProps: Record<string, unknown>, kind: StatsKind) {
  const stats = isRecord(pageProps.stats) ? pageProps.stats : {};
  const raw = Array.isArray(stats[kind]) ? stats[kind] : [];

  return raw
    .map((item): Pick<StatsCategory, "name" | "title" | "valueLabel" | "sourceUrl"> | null => {
      if (!isRecord(item)) return null;
      const name = cleanText(item.name);
      const title = cleanText(item.header) || cleanText(item.title) || name;
      const sourceUrl = cleanText(item.fetchAllUrl);
      if (!name || !sourceUrl) return null;
      return {
        name,
        title,
        valueLabel: title,
        sourceUrl,
      };
    })
    .filter((item): item is Pick<StatsCategory, "name" | "title" | "valueLabel" | "sourceUrl"> => item !== null);
}

function parseStatRows(payload: unknown, kind: StatsKind, valueLabel: string): StatsRow[] {
  const topLists = isRecord(payload) && Array.isArray(payload.TopLists) ? payload.TopLists : [];
  const firstList = topLists.find(isRecord);
  const statList = firstList && Array.isArray(firstList.StatList) ? firstList.StatList : [];

  return statList
    .slice(0, 20)
    .map((item, index): StatsRow | null => {
      if (!isRecord(item)) return null;
      const name = cleanText(item.ParticipantName);
      if (!name) return null;

      const values: Record<string, string> = {};
      const statValue = formatStatValue(item.StatValue);
      if (statValue) values[valueLabel] = statValue;

      const matches = formatStatValue(item.MatchesPlayed);
      const minutes = formatStatValue(item.MinutesPlayed);
      if (matches) values.Apps = matches;
      if (minutes) values.Mins = minutes;

      const subStat = formatStatValue(item.SubStatValue);
      const subTitle = cleanText(firstList?.Subtitle);
      if (subTitle && subStat) values[subTitle] = subStat;

      const rank = numberValue(item.Rank, index + 1);
      const row: StatsRow = {
        rank,
        name,
        values,
      };

      if (kind === "players") {
        const team = cleanText(item.TeamName);
        if (team) row.team = team;
      }

      return row;
    })
    .filter((row): row is StatsRow => row !== null);
}

async function fetchStatCategory(
  category: Pick<StatsCategory, "name" | "title" | "valueLabel" | "sourceUrl">,
  kind: StatsKind,
): Promise<StatsCategory> {
  if (!category.sourceUrl) {
    return { ...category, rows: [], sourceUrl: null };
  }

  const res = await fetch(category.sourceUrl, {
    headers: {
      Accept: "application/json",
      "User-Agent":
        "Mozilla/5.0 (compatible; WC2026Pickem/1.0; +https://wc2026.followbuilders.workers.dev)",
    },
  });

  if (!res.ok) {
    throw new QualificationStatsError(
      `FotMob stat feed ${res.status} on ${category.sourceUrl}`,
      res.status,
    );
  }

  const json = await res.json();
  return {
    ...category,
    rows: parseStatRows(json, kind, category.valueLabel),
  };
}

async function fetchStatCategories(
  pageProps: Record<string, unknown>,
  kind: StatsKind,
): Promise<StatsCategory[]> {
  const categories = statCategories(pageProps, kind);
  const fetched: StatsCategory[] = [];

  // Keep requests sequential. These refreshes are admin-triggered and one-off,
  // so reliability matters more than making dozens of concurrent FotMob calls.
  for (const category of categories) {
    fetched.push(await fetchStatCategory(category, kind));
  }

  return fetched;
}

function tableBlocks(pageProps: Record<string, unknown>) {
  const table = Array.isArray(pageProps.table)
    ? pageProps.table.find(isRecord)
    : isRecord(pageProps.table)
      ? pageProps.table
      : null;

  const data = table && isRecord(table.data) ? table.data : table;
  if (data && Array.isArray(data.tables)) return data.tables;
  if (data && isRecord(data.table) && Array.isArray(data.table.all)) return [data];
  return [];
}

function parseGroupTables(pageProps: Record<string, unknown>): GroupTable[] {
  return tableBlocks(pageProps)
    .map((group): GroupTable | null => {
      if (!isRecord(group)) return null;
      const name = cleanText(group.leagueName);
      const table = isRecord(group.table) ? group.table : null;
      const rows = table && Array.isArray(table.all) ? table.all : [];
      if (!name || rows.length === 0) return null;

      return {
        name: name.replace(/^1st Round Grp\.\s*/i, "Group "),
        rows: rows
          .map((row): GroupTableRow | null => {
            if (!isRecord(row)) return null;
            const teamName = cleanText(row.name) || cleanText(row.shortName);
            if (!teamName) return null;
            return {
              rank: numberValue(row.idx),
              name: teamName,
              played: numberValue(row.played),
              wins: numberValue(row.wins),
              draws: numberValue(row.draws),
              losses: numberValue(row.losses),
              scoresStr: cleanText(row.scoresStr),
              goalConDiff: numberValue(row.goalConDiff),
              pts: numberValue(row.pts),
              qualColor: cleanText(row.qualColor) || null,
            };
          })
          .filter((row): row is GroupTableRow => row !== null),
      };
    })
    .filter((group): group is GroupTable => group !== null);
}

function matchesCount(pageProps: Record<string, unknown>) {
  const fixtures = isRecord(pageProps.fixtures) ? pageProps.fixtures : {};
  if (Array.isArray(fixtures.allMatches)) return fixtures.allMatches.length;

  const overview = isRecord(pageProps.overview) ? pageProps.overview : {};
  const matches = isRecord(overview.matches) ? overview.matches : {};
  return Array.isArray(matches.allMatches) ? matches.allMatches.length : 0;
}

function summaryRows(categories: StatsCategory[], preferredName: string) {
  return (
    categories.find((category) => category.name === preferredName)?.rows ??
    categories.find((category) => category.rows.length > 0)?.rows ??
    []
  );
}

export async function loadQualificationStats(): Promise<QualificationStatsPayload | null> {
  const { env } = await getCloudflareContext({ async: true });
  const raw = await env.CACHE.get(KV_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as QualificationStatsPayload;
    if (!parsed || !Array.isArray(parsed.competitions)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function refreshQualificationStats(): Promise<QualificationStatsPayload> {
  const competitions: CompetitionStats[] = [];

  for (const config of COMPETITION_CONFIG) {
    const playerUrl = statsPageUrl(config);
    const teamUrl = playerUrl;

    try {
      const statsPage = await fetchFotmobPage(playerUrl);
      const tablePage = await fetchFotmobPage(tablePageUrl(config));
      const playerCategories = await fetchStatCategories(statsPage, "players");
      const teamCategories = await fetchStatCategories(statsPage, "teams");

      competitions.push({
        competition: config.competition,
        playerUrl,
        teamUrl,
        groups: parseGroupTables(tablePage),
        players: summaryRows(playerCategories, "rating"),
        teams: summaryRows(teamCategories, "rating_team"),
        playerCategories,
        teamCategories,
        matchesCount: matchesCount(statsPage),
        ...(!playerCategories.some((category) => category.rows.length) &&
        !teamCategories.some((category) => category.rows.length)
          ? { error: "FotMob loaded, but no stat rows were parsed." }
          : {}),
      });
    } catch (e) {
      competitions.push({
        competition: config.competition,
        playerUrl,
        teamUrl,
        groups: [],
        players: [],
        teams: [],
        playerCategories: [],
        teamCategories: [],
        matchesCount: 0,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  const payload: QualificationStatsPayload = {
    fetchedAt: Math.floor(Date.now() / 1000),
    competitions,
  };

  const { env } = await getCloudflareContext({ async: true });
  await env.CACHE.put(KV_KEY, JSON.stringify(payload));
  return payload;
}
