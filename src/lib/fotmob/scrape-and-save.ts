import { and, eq, isNotNull, lt, ne } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { matches, type Match } from "@/db/schema";
import * as schema from "@/db/schema";
import { discoverAllWcFixtures } from "@/lib/fotmob/fixtures";
import { resolvePlayerId } from "@/lib/matches/name-match";
import type { MatchEvent } from "@/lib/scoring/compute";
import type {
  FotmobMatchSnapshot,
  FotmobMatchStatGroup,
  FotmobMatchStatRow,
} from "@/lib/matches/raw-events";

type Db = DrizzleD1Database<typeof schema>;

export interface SaveReport {
  matchId: number;
  homeTeamId: number;
  awayTeamId: number;
  homeScore: number | null;
  awayScore: number | null;
  status: "scheduled" | "live" | "finished";
  sourceUrl: string | null;
  events: Array<{
    type: "goal" | "own_goal" | "assist";
    minute: number;
    playerName: string;
    fotmobPlayerId: string;
    playerId: number | null;
    teamId: number;
  }>;
  unresolvedPlayers: Array<{ name: string; fotmobPlayerId: string; teamId: number }>;
  written: boolean;
  error?: string;
}

type FotmobPageProps = Record<string, unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cleanText(value: unknown) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseScore(scoreStr: unknown) {
  const match = cleanText(scoreStr).match(/^(\d+)\s*-\s*(\d+)$/);
  if (!match) return { homeScore: null, awayScore: null };
  return { homeScore: Number(match[1]), awayScore: Number(match[2]) };
}

function parseStatus(status: unknown): SaveReport["status"] {
  if (!isRecord(status)) return "scheduled";
  if (status.finished === true) return "finished";
  if (status.started === true) return "live";
  return "scheduled";
}

async function fetchFotmobPage(url: string): Promise<FotmobPageProps> {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; WC2026Pickem/1.0; +https://wc2026.followbuilders.workers.dev)",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
  });
  if (!res.ok) throw new Error(`FotMob ${res.status} on ${url}`);

  const html = await res.text();
  const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/);
  if (!match) throw new Error(`FotMob page did not include __NEXT_DATA__: ${url}`);

  const parsed = JSON.parse(match[1]) as { props?: { pageProps?: FotmobPageProps } };
  if (!parsed.props?.pageProps) throw new Error(`FotMob page had no pageProps: ${url}`);
  return parsed.props.pageProps;
}

function header(pageProps: FotmobPageProps) {
  return isRecord(pageProps.header) ? pageProps.header : {};
}

function content(pageProps: FotmobPageProps) {
  return isRecord(pageProps.content) ? pageProps.content : {};
}

function general(pageProps: FotmobPageProps) {
  return isRecord(pageProps.general) ? pageProps.general : {};
}

function matchEvents(pageProps: FotmobPageProps) {
  const rawContent = content(pageProps);
  const matchFacts = isRecord(rawContent.matchFacts)
    ? rawContent.matchFacts
    : {};
  const events = isRecord(matchFacts.events) ? matchFacts.events : {};
  return Array.isArray(events.events) ? events.events : [];
}

function resolveEventPlayer(name: string, fotmobPlayerId: string, teamId: number) {
  return resolvePlayerId(name, teamId)?.id ?? null;
}

function eventMinute(raw: Record<string, unknown>) {
  return numberValue(raw.time) ?? numberValue(raw.timeStr) ?? 0;
}

function buildEvents(pageProps: FotmobPageProps, homeTeamId: number, awayTeamId: number) {
  const events: SaveReport["events"] = [];
  const unresolved: SaveReport["unresolvedPlayers"] = [];

  for (const raw of matchEvents(pageProps)) {
    if (!isRecord(raw) || raw.type !== "Goal" || raw.isPenaltyShootoutEvent === true) continue;
    const player = isRecord(raw.player) ? raw.player : {};
    const playerName = cleanText(player.name) || cleanText(raw.nameStr) || cleanText(raw.fullName);
    const fotmobPlayerId = cleanText(player.id) || cleanText(raw.playerId);
    if (!playerName) continue;

    const isHome = raw.isHome === true;
    const benefitTeamId = isHome ? homeTeamId : awayTeamId;
    const scorerTeamId = raw.ownGoal
      ? isHome ? awayTeamId : homeTeamId
      : benefitTeamId;
    const playerId = resolveEventPlayer(playerName, fotmobPlayerId, scorerTeamId);
    if (playerId == null) {
      unresolved.push({ name: playerName, fotmobPlayerId, teamId: scorerTeamId });
    }

    events.push({
      type: raw.ownGoal ? "own_goal" : "goal",
      minute: eventMinute(raw),
      playerName,
      fotmobPlayerId,
      playerId,
      teamId: scorerTeamId,
    });

    if (raw.ownGoal) continue;
    const assistName = cleanText(raw.assistInput);
    const assistFotmobPlayerId = cleanText(raw.assistPlayerId);
    if (!assistName) continue;
    const assistPlayerId = resolveEventPlayer(assistName, assistFotmobPlayerId, benefitTeamId);
    if (assistPlayerId == null) {
      unresolved.push({
        name: assistName,
        fotmobPlayerId: assistFotmobPlayerId,
        teamId: benefitTeamId,
      });
    }
    events.push({
      type: "assist",
      minute: eventMinute(raw),
      playerName: assistName,
      fotmobPlayerId: assistFotmobPlayerId,
      playerId: assistPlayerId,
      teamId: benefitTeamId,
    });
  }

  return { events, unresolved };
}

function statGroups(pageProps: FotmobPageProps): FotmobMatchStatGroup[] {
  const rawContent = content(pageProps);
  const stats = isRecord(rawContent.stats) ? rawContent.stats : {};
  const periods = isRecord(stats.Periods) ? stats.Periods : {};
  const all = isRecord(periods.All) ? periods.All : {};
  const groups = Array.isArray(all.stats) ? all.stats : [];

  return groups
    .map((group: unknown): FotmobMatchStatGroup | null => {
      if (!isRecord(group) || !Array.isArray(group.stats)) return null;
      const title = cleanText(group.title);
      const key = cleanText(group.key);
      const rows = group.stats
        .map((row): FotmobMatchStatRow | null => {
          if (!isRecord(row) || !Array.isArray(row.stats) || row.stats.length < 2) return null;
          if (row.type === "title") return null;
          const rowTitle = cleanText(row.title);
          const rowKey = cleanText(row.key);
          if (!rowTitle || !rowKey) return null;
          return {
            title: rowTitle,
            key: rowKey,
            stats: [row.stats[0], row.stats[1]],
          };
        })
        .filter((row): row is FotmobMatchStatRow => row !== null);
      if (!title || rows.length === 0) return null;
      return { title, key, stats: rows };
    })
    .filter((group: FotmobMatchStatGroup | null): group is FotmobMatchStatGroup => group !== null);
}

function teamName(raw: unknown) {
  return isRecord(raw) ? cleanText(raw.name) : "";
}

function snapshot(pageProps: FotmobPageProps, sourceUrl: string): FotmobMatchSnapshot {
  const rawGeneral = general(pageProps);
  const rawHeader = header(pageProps);
  const status = isRecord(rawHeader.status) ? rawHeader.status : {};
  return {
    matchId: cleanText(rawGeneral.matchId),
    sourceUrl,
    homeTeam: teamName(rawGeneral.homeTeam),
    awayTeam: teamName(rawGeneral.awayTeam),
    statusReason:
      (isRecord(status.reason) ? cleanText(status.reason.long) : "") ||
      (isRecord(status.reason) ? cleanText(status.reason.short) : "") ||
      null,
    stats: statGroups(pageProps),
    fetchedAt: Math.floor(Date.now() / 1000),
  };
}

async function resolveFotmobMatchUrl(matchId: string) {
  const discovered = await discoverAllWcFixtures();
  const fixture = discovered.fixtures.find((item) => item.externalMatchId === matchId);
  return fixture?.matchUrl ?? null;
}

export async function scrapeFotmobMatchUrl(url: string) {
  const pageProps = await fetchFotmobPage(url);
  const rawHeader = header(pageProps);
  const status = isRecord(rawHeader.status) ? rawHeader.status : {};
  const { homeScore, awayScore } = parseScore(status.scoreStr);
  return {
    pageProps,
    sourceUrl: url,
    status: parseStatus(status),
    homeScore,
    awayScore,
    snapshot: snapshot(pageProps, url),
  };
}

export async function scrapeAndSaveRow(row: Match, db: Db): Promise<SaveReport> {
  if (!row.externalMatchId) {
    return {
      matchId: row.id,
      homeTeamId: row.homeTeamId ?? 0,
      awayTeamId: row.awayTeamId ?? 0,
      homeScore: row.homeScore,
      awayScore: row.awayScore,
      status: row.status,
      sourceUrl: null,
      events: [],
      unresolvedPlayers: [],
      written: false,
      error: "no FotMob match id mapped",
    };
  }
  if (row.homeTeamId == null || row.awayTeamId == null) {
    return {
      matchId: row.id,
      homeTeamId: row.homeTeamId ?? 0,
      awayTeamId: row.awayTeamId ?? 0,
      homeScore: row.homeScore,
      awayScore: row.awayScore,
      status: row.status,
      sourceUrl: null,
      events: [],
      unresolvedPlayers: [],
      written: false,
      error: "missing team ids",
    };
  }

  const sourceUrl = await resolveFotmobMatchUrl(row.externalMatchId);
  if (!sourceUrl) {
    return {
      matchId: row.id,
      homeTeamId: row.homeTeamId,
      awayTeamId: row.awayTeamId,
      homeScore: row.homeScore,
      awayScore: row.awayScore,
      status: row.status,
      sourceUrl: null,
      events: [],
      unresolvedPlayers: [],
      written: false,
      error: `FotMob match ${row.externalMatchId} not found in WC 2026 fixtures`,
    };
  }

  const scraped = await scrapeFotmobMatchUrl(sourceUrl);
  const { events, unresolved } = buildEvents(scraped.pageProps, row.homeTeamId, row.awayTeamId);

  let written = false;
  if (scraped.status === "finished") {
    const rawEvents: MatchEvent[] = events
      .filter((event) => event.playerId != null)
      .map((event) => ({
        type: event.type,
        playerId: event.playerId!,
        teamId: event.teamId,
        minute: event.minute,
      }));

    await db
      .update(matches)
      .set({
        homeScore: scraped.homeScore,
        awayScore: scraped.awayScore,
        status: "finished",
        rawEvents: {
          events: rawEvents,
          fotmob: scraped.snapshot,
        },
        ingestedAt: Math.floor(Date.now() / 1000),
      })
      .where(eq(matches.id, row.id));
    written = true;
  }

  return {
    matchId: row.id,
    homeTeamId: row.homeTeamId,
    awayTeamId: row.awayTeamId,
    homeScore: scraped.homeScore,
    awayScore: scraped.awayScore,
    status: scraped.status,
    sourceUrl,
    events,
    unresolvedPlayers: unresolved,
    written,
  };
}

export async function findEligibleMatches(db: Db, ageMinSeconds = 4 * 3600): Promise<Match[]> {
  const cutoff = Math.floor(Date.now() / 1000) - ageMinSeconds;
  return db
    .select()
    .from(matches)
    .where(
      and(
        ne(matches.status, "finished"),
        isNotNull(matches.externalMatchId),
        lt(matches.kickoffUtc, cutoff),
      ),
    );
}
