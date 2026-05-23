/**
 * Parse a WhoScored stage fixtures page into a list of upcoming/finished
 * matches with their WhoScored match IDs, team IDs, and kickoff times.
 *
 * The stage fixtures URL is:
 *   /regions/247/tournaments/36/seasons/<seasonId>/stages/<stageId>/fixtures/...
 *
 * For WC 2026, season = 10498, stages run from Group A (23753) through the
 * Final Stage. We discover all 104 fixtures by scraping each stage page once
 * (12 groups, 1 final stage).
 *
 * Output rows are intentionally URL-fragment-only (no D1 write) so the
 * admin can review the mapping before it's persisted.
 */
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { FirecrawlError } from "./scrape";

export interface ScrapedFixture {
  whoscoredMatchId: string;
  /** Full match URL on whoscored.com — pass into scrapeMatch() once finished. */
  matchUrl: string;
  homeTeam: string;
  awayTeam: string;
  homeTeamWsId: string;
  awayTeamWsId: string;
  /** UNIX seconds. Local-time kickoff WhoScored shows, treated as UTC. */
  kickoffUtc: number | null;
  /** "Group A", "Group B", ..., "Final Stage" — pulled from the page header. */
  stageLabel: string | null;
}

const MONTHS: Record<string, number> = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
};

async function fetchFixturesMarkdown(stageUrl: string): Promise<string> {
  const { env } = await getCloudflareContext({ async: true });
  const key = (env as unknown as { FIRECRAWL_API_KEY?: string }).FIRECRAWL_API_KEY;
  if (!key) throw new FirecrawlError("FIRECRAWL_API_KEY not configured.");

  const res = await fetch("https://api.firecrawl.dev/v2/scrape", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      url: stageUrl,
      formats: ["markdown"],
      onlyMainContent: false,
      waitFor: 4000,
    }),
  });
  if (!res.ok) throw new FirecrawlError(`Firecrawl ${res.status} on ${stageUrl}`, res.status);
  const body = (await res.json()) as { success?: boolean; data?: { markdown?: string }; error?: string };
  if (!body.success || !body.data?.markdown) {
    throw new FirecrawlError(body.error ?? "Firecrawl returned no markdown");
  }
  return body.data.markdown;
}

/**
 * Parse fixtures markdown. The structure repeats per match:
 *
 *   <Day name>, <Month> <D> <YYYY>     ← only on first match of that day
 *   1X2                                  ← (optional) odds market label
 *   <HH>:<MM>                            ← kickoff time
 *   [--](.../matches/<id>/show/<slug>)   ← match URL
 *   [Home Team](.../teams/<id>/show/...)
 *   [Away Team](.../teams/<id>/show/...)
 *   <odds> <odds> <odds>                 ← three odds numbers
 *
 * We walk by match URL anchors, then look BACKWARDS for the nearest day-date
 * + the nearest HH:MM that precedes the URL, and FORWARDS for the two team
 * links that immediately follow.
 */
export function parseFixturesMarkdown(md: string): ScrapedFixture[] {
  const lines = md.split("\n");

  // 1) Stage label — pull from "# FIFA World Cup Grp. A" header
  let stageLabel: string | null = null;
  for (const l of lines) {
    const m = l.match(/^#\s+FIFA World Cup\s+(.+?)\s*(?:\[|$)/);
    if (m) {
      stageLabel = m[1].trim().replace(/^Grp\.\s+/i, "Group ");
      break;
    }
  }

  // 2) Index all match URLs (line index + match id + URL).
  const matchAnchors: Array<{ line: number; matchId: string; url: string }> = [];
  const matchAnchorRe =
    /\[--\]\((https:\/\/www\.whoscored\.com\/matches\/(\d+)\/[a-z]+\/[a-z0-9-]+)\)/i;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(matchAnchorRe);
    if (m) matchAnchors.push({ line: i, matchId: m[2], url: m[1] });
  }

  // 3) Index all "Day, Month DD YYYY" lines.
  const dayDateRe =
    /^(?:Mon|Tues|Tue|Wed|Wednes|Thurs|Thu|Fri|Sat|Satur|Sun|Sundae|Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)[a-z]*,\s+([A-Za-z]{3})\s+(\d{1,2})\s+(\d{4})/;
  const dateAtLine = new Map<number, { month: number; day: number; year: number }>();
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].trim().match(dayDateRe);
    if (m && MONTHS[m[1]] != null) {
      dateAtLine.set(i, { month: MONTHS[m[1]], day: Number(m[2]), year: Number(m[3]) });
    }
  }

  // 4) Helper: nearest preceding date for a given line index.
  const dateKeys = [...dateAtLine.keys()].sort((a, b) => a - b);
  function nearestDateBefore(lineIdx: number) {
    let found: { month: number; day: number; year: number } | null = null;
    for (const k of dateKeys) {
      if (k <= lineIdx) found = dateAtLine.get(k)!;
      else break;
    }
    return found;
  }

  // 5) Helper: nearest HH:MM line preceding lineIdx (limited window).
  const timeRe = /^(\d{1,2}):(\d{2})\s*$/;
  function nearestTimeBefore(lineIdx: number) {
    for (let i = lineIdx - 1; i >= Math.max(0, lineIdx - 8); i--) {
      const t = lines[i].trim().match(timeRe);
      if (t) return { h: Number(t[1]), m: Number(t[2]) };
    }
    return null;
  }

  // 6) Helper: next two team links following lineIdx.
  const teamLinkRe =
    /\[([^\]]+)\]\((https:\/\/www\.whoscored\.com\/teams\/(\d+)\/[^\)]+)\)/;
  function nextTwoTeams(lineIdx: number) {
    const teams: Array<{ name: string; wsId: string }> = [];
    for (let i = lineIdx + 1; i < Math.min(lines.length, lineIdx + 12); i++) {
      const m = lines[i].match(teamLinkRe);
      if (m) {
        teams.push({ name: m[1].trim(), wsId: m[3] });
        if (teams.length === 2) break;
      }
    }
    return teams;
  }

  // 7) Build fixtures.
  const fixtures: ScrapedFixture[] = [];
  for (const a of matchAnchors) {
    const date = nearestDateBefore(a.line);
    const time = nearestTimeBefore(a.line);
    const teams = nextTwoTeams(a.line);
    if (teams.length !== 2) continue;

    let kickoffUtc: number | null = null;
    if (date && time) {
      kickoffUtc = Math.floor(
        Date.UTC(date.year, date.month, date.day, time.h, time.m) / 1000,
      );
    }

    fixtures.push({
      whoscoredMatchId: a.matchId,
      matchUrl: a.url,
      homeTeam: teams[0].name,
      awayTeam: teams[1].name,
      homeTeamWsId: teams[0].wsId,
      awayTeamWsId: teams[1].wsId,
      kickoffUtc,
      stageLabel,
    });
  }
  return fixtures;
}

export async function scrapeFixtures(stageUrl: string): Promise<ScrapedFixture[]> {
  const md = await fetchFixturesMarkdown(stageUrl);
  return parseFixturesMarkdown(md);
}

/**
 * Hardcoded WC 2026 stage IDs — empirically discovered:
 *   23753 = Group A   …   23764 = Group L   23765 = Final Stage
 * If WhoScored renumbers (rare for an in-progress tournament), update here.
 */
export const WC2026_SEASON_ID = 10498;
export const WC2026_STAGE_IDS = Array.from({ length: 13 }, (_, i) => 23753 + i);

function stageFixturesUrl(stageId: number): string {
  return `https://www.whoscored.com/regions/247/tournaments/36/seasons/${WC2026_SEASON_ID}/stages/${stageId}/fixtures/international-fifa-world-cup-2026`;
}

export interface DiscoverAllResult {
  fixtures: ScrapedFixture[];
  stages: Array<{ stageId: number; label: string | null; count: number; error?: string }>;
}

/**
 * Scrape all 13 WC 2026 stage fixture pages and return the merged list.
 * Sequential (not parallel) to stay polite to Firecrawl + WhoScored.
 * Per-stage errors are captured but don't fail the whole batch.
 */
/**
 * Stage derivation: groups via the stageLabel ("Group A".."Group L"),
 * KO rounds from the kickoff date against the WC 2026 schedule. Returns
 * one of the match.stage enum values, plus group letter when applicable.
 */
export function deriveStage(
  stageLabel: string | null,
  kickoffUtc: number | null,
): { stage: "group" | "r32" | "r16" | "qf" | "sf" | "final" | "3p"; groupLetter: string | null } {
  if (stageLabel?.startsWith("Group ")) {
    const letter = stageLabel.replace(/^Group\s+/i, "").trim().charAt(0).toUpperCase();
    return { stage: "group", groupLetter: letter || null };
  }
  // Final stage — derive from date.
  if (kickoffUtc == null) return { stage: "r32", groupLetter: null };
  const d = new Date(kickoffUtc * 1000);
  // (month+1)*100 + day so Jun 28 = 628, Jul 19 = 719.
  const md = (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
  if (md >= 628 && md <= 703) return { stage: "r32", groupLetter: null };   // Jun 28 – Jul 3
  if (md >= 704 && md <= 707) return { stage: "r16", groupLetter: null };   // Jul 4 – Jul 7
  if (md >= 709 && md <= 711) return { stage: "qf", groupLetter: null };    // Jul 9 – Jul 11
  if (md >= 714 && md <= 715) return { stage: "sf", groupLetter: null };    // Jul 14 – Jul 15
  if (md === 718) return { stage: "3p", groupLetter: null };                // Jul 18
  if (md === 719) return { stage: "final", groupLetter: null };             // Jul 19
  return { stage: "r32", groupLetter: null };
}

export async function discoverAllWcFixtures(): Promise<DiscoverAllResult> {
  const fixtures: ScrapedFixture[] = [];
  const stages: DiscoverAllResult["stages"] = [];

  for (const stageId of WC2026_STAGE_IDS) {
    try {
      const md = await fetchFixturesMarkdown(stageFixturesUrl(stageId));
      const list = parseFixturesMarkdown(md);
      fixtures.push(...list);
      stages.push({
        stageId,
        label: list[0]?.stageLabel ?? null,
        count: list.length,
      });
    } catch (e) {
      stages.push({
        stageId,
        label: null,
        count: 0,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return { fixtures, stages };
}
