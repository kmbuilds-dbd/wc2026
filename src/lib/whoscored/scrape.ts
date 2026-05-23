/**
 * WhoScored.com match scraper, powered by Firecrawl.
 *
 * WhoScored's match page is heavily JS-rendered and gated by Cloudflare bot
 * mitigation, so direct fetch from a CF Worker doesn't work. Firecrawl runs
 * a headless browser server-side and returns clean markdown.
 *
 * We parse the markdown into a strongly-typed `ScrapedMatch` shape that maps
 * to our `matches` table. Player names aren't resolved to player_ids here —
 * that's a follow-up name-matching step that the admin can verify.
 *
 * Cost: 1 Firecrawl scrape per match per refresh. ~64 WC matches × 1-2
 * scrapes = well under the Firecrawl free tier.
 */
import { getCloudflareContext } from "@opennextjs/cloudflare";

export class FirecrawlError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = "FirecrawlError";
  }
}

export type MatchStatus = "scheduled" | "live" | "finished";

export interface ScrapedPlayer {
  name: string;
  /** WhoScored's player id (from /players/<id>/...). Not our internal id. */
  wsPlayerId: string;
}

export interface ScrapedGoal {
  /** The side whose score went up. For OG, this is the BENEFITTING team —
   *  i.e., the opposing team of the scorer's own team. */
  side: "home" | "away";
  minute: number;
  scorer: ScrapedPlayer;
  /** Players credited with the assist(s). Empty for OGs and unassisted goals. */
  assisters: ScrapedPlayer[];
  /** True if marked (OG) in the team section. Scorer's team_id and side
   *  will be on opposite sides when ownGoal=true. */
  ownGoal: boolean;
  /** True if marked (Pen). */
  penalty: boolean;
}

export interface ScrapedMatch {
  url: string;
  whoscoredId: string | null;
  homeTeam: string;
  awayTeam: string;
  homeTeamWsId: string | null;
  awayTeamWsId: string | null;
  homeScore: number | null;
  awayScore: number | null;
  htHomeScore: number | null;
  htAwayScore: number | null;
  status: MatchStatus;
  /** Unix seconds. Null if we can't parse the date. WhoScored doesn't always
   *  expose a timezone, so this is the kickoff in UTC inferred from the page. */
  kickoffUtc: number | null;
  goals: ScrapedGoal[];
  homeFormation: string | null;
  awayFormation: string | null;
  venue: string | null;
  /** Raw markdown — kept for debugging / future parse iteration. */
  rawMarkdown: string;
}

async function fetchMarkdown(url: string): Promise<string> {
  const { env } = await getCloudflareContext({ async: true });
  const key = (env as unknown as { FIRECRAWL_API_KEY?: string }).FIRECRAWL_API_KEY;
  if (!key) {
    throw new FirecrawlError(
      "FIRECRAWL_API_KEY not configured. Set via `wrangler secret put FIRECRAWL_API_KEY`.",
    );
  }
  const res = await fetch("https://api.firecrawl.dev/v2/scrape", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      url,
      formats: ["markdown"],
      onlyMainContent: false,
      waitFor: 3000,
    }),
  });
  if (!res.ok) {
    throw new FirecrawlError(
      `Firecrawl ${res.status} on ${url}`,
      res.status,
    );
  }
  const body = (await res.json()) as {
    success?: boolean;
    error?: string;
    data?: { markdown?: string };
  };
  if (!body.success || !body.data?.markdown) {
    throw new FirecrawlError(body.error ?? "Firecrawl returned no markdown");
  }
  return body.data.markdown;
}

/** Pull team name + WhoScored team id from a `[Name](url-with-/teams/<id>/)` link. */
function parseTeamLink(line: string): { name: string; wsId: string | null } | null {
  const match = line.match(/\[([^\]]+)\]\(https:\/\/www\.whoscored\.com\/teams\/(\d+)\/[^\)]+\)/);
  if (!match) return null;
  return { name: match[1].trim(), wsId: match[2] };
}

/** Parse "Fiorentina 1 : 1 Atalanta" header table to extract teams + score. */
function parseHeader(md: string): {
  home?: { name: string; wsId: string | null };
  away?: { name: string; wsId: string | null };
  homeScore: number | null;
  awayScore: number | null;
  htHomeScore: number | null;
  htAwayScore: number | null;
  status: MatchStatus;
  kickoffUtc: number | null;
} {
  const teamLinks: Array<{ name: string; wsId: string | null }> = [];
  for (const line of md.split("\n")) {
    const parsed = parseTeamLink(line);
    if (parsed && !teamLinks.some((t) => t.wsId === parsed.wsId)) {
      teamLinks.push(parsed);
      if (teamLinks.length === 2) break;
    }
  }

  const home = teamLinks[0];
  const away = teamLinks[1];

  // The header has rows like:
  //   | [Fiorentina](...) | 1 : 1 | [Atalanta](...) |
  //   | ![flag] | Elapsed:FT<br>Half time:1 : 0Full time:1 : 1<br>Kick off:19:45Date:Fri, 22-May-26 | ![flag] |
  const scoreMatch = md.match(/\|\s*\[[^\]]+\]\([^\)]+\)\s*\|\s*(\d+)\s*:\s*(\d+)\s*\|\s*\[[^\]]+\]/);
  const homeScore = scoreMatch ? Number(scoreMatch[1]) : null;
  const awayScore = scoreMatch ? Number(scoreMatch[2]) : null;

  const htMatch = md.match(/Half\s*time\s*:\s*(\d+)\s*:\s*(\d+)/i);
  const htHomeScore = htMatch ? Number(htMatch[1]) : null;
  const htAwayScore = htMatch ? Number(htMatch[2]) : null;

  // Status: WhoScored uses Elapsed:FT for finished, Elapsed:HT or Elapsed:NN'
  // for live, and no Elapsed marker (or "vs") for scheduled.
  const elapsedMatch = md.match(/Elapsed\s*:\s*([A-Z0-9']{1,5})/);
  let status: MatchStatus = "scheduled";
  if (elapsedMatch) {
    const v = elapsedMatch[1];
    status = v === "FT" ? "finished" : "live";
  } else if (homeScore != null && awayScore != null && /Full\s*time/i.test(md)) {
    status = "finished";
  }

  // Kickoff: "Kick off:19:45 Date:Fri, 22-May-26"
  let kickoffUtc: number | null = null;
  const kickoffMatch = md.match(/Kick\s*off\s*:\s*(\d{1,2}):(\d{2})/i);
  const dateMatch = md.match(/Date\s*:\s*[A-Za-z]+,\s*(\d{1,2})-([A-Za-z]{3})-(\d{2})/);
  if (kickoffMatch && dateMatch) {
    const monthMap: Record<string, number> = {
      Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
      Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
    };
    const day = Number(dateMatch[1]);
    const month = monthMap[dateMatch[2]];
    const year = 2000 + Number(dateMatch[3]);
    const h = Number(kickoffMatch[1]);
    const m = Number(kickoffMatch[2]);
    if (month != null) {
      // WhoScored shows local site time which appears to be UTC for most pages.
      kickoffUtc = Math.floor(Date.UTC(year, month, day, h, m) / 1000);
    }
  }

  return {
    home,
    away,
    homeScore,
    awayScore,
    htHomeScore,
    htAwayScore,
    status,
    kickoffUtc,
  };
}

/**
 * Find the line index where a team's dedicated section starts. WhoScored
 * shows each team name as a markdown link multiple times: once in the score
 * header table (line inside `| ... |`) and once standalone above their
 * formation block. We want the latter, identifiable by the next non-empty
 * line starting with `Manager:`.
 */
function findTeamSectionStart(lines: string[], teamName: string): number {
  const linkRe = new RegExp(`^\\[${teamName.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}\\]\\(`);
  for (let i = 0; i < lines.length; i++) {
    if (!linkRe.test(lines[i])) continue;
    for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
      if (lines[j].trim() === "") continue;
      if (/^Manager:/i.test(lines[j])) return i;
      break;
    }
  }
  return -1;
}

/**
 * Per-team section returns simple goal records with explicit OG / Pen flags.
 * These get merged into Timeline-derived goals (which have scorer + assists
 * with player IDs but no OG/Pen markers).
 */
interface SectionGoalFlag {
  side: "home" | "away";
  minute: number;
  scorerSurname: string;
  ownGoal: boolean;
  penalty: boolean;
}

function parseSectionGoalFlags(
  md: string,
  side: "home" | "away",
  teamName: string,
  scoreLine: string,
): SectionGoalFlag[] {
  const lines = md.split("\n");
  const start = findTeamSectionStart(lines, teamName);
  if (start < 0) return [];

  let stopIdx = lines.length;
  if (side === "home") {
    for (let i = start + 1; i < lines.length; i++) {
      if (lines[i].trim() === scoreLine || /^\s*FT\s*$/.test(lines[i]) || /^\s*HT\s*$/.test(lines[i])) {
        stopIdx = i;
        break;
      }
    }
  } else {
    for (let i = start + 1; i < lines.length; i++) {
      if (/^####\s+Substitutes/i.test(lines[i])) {
        stopIdx = i;
        break;
      }
    }
  }

  const out: SectionGoalFlag[] = [];
  const goalLine = /^\s*-\s+(\d{1,3})'\s+(.+?)\s*$/;
  for (let i = start + 1; i < stopIdx; i++) {
    const m = lines[i].match(goalLine);
    if (!m) continue;
    const minute = Number(m[1]);
    let raw = m[2];
    const ownGoal = /\(OG\)/i.test(raw);
    const penalty = /\(Pen\)/i.test(raw);
    raw = raw.replace(/\((?:OG|Pen)\)/gi, "").trim();
    const surname = raw.split(/\s+/).pop()?.toLowerCase() ?? "";
    out.push({ side, minute, scorerSurname: surname, ownGoal, penalty });
  }
  return out;
}

const PLAYER_LINK_RE =
  /\[([^\]]+)\]\(https:\/\/www\.whoscored\.com\/players\/(\d+)\/[^\)]+\)/g;

/**
 * Parse the "## Timeline" section. Each row is a markdown table:
 *   | <home cell> | <minute> | <away cell> |
 *
 * A cell with a `(X-Y)` score marker is a goal: the player link immediately
 * followed by `(X-Y)` is the scorer; all other player links in that cell
 * are assisters. Cells without a score marker are substitutions (skipped).
 *
 * For OGs, the player listed is the OG scorer and the marker may appear
 * BEFORE the player link. OG / Pen flags come from the team sections.
 */
function parseTimelineGoals(md: string): Array<{
  side: "home" | "away";
  minute: number;
  scorer: ScrapedPlayer;
  assisters: ScrapedPlayer[];
}> {
  const start = md.indexOf("## Timeline");
  if (start < 0) return [];
  let end = md.length;
  for (const marker of ["- [Match Centre](", "\n## ", "\n#### "]) {
    const idx = md.indexOf(marker, start + 11);
    if (idx > start && idx < end) end = idx;
  }
  const section = md.slice(start, end);

  const out: Array<{
    side: "home" | "away";
    minute: number;
    scorer: ScrapedPlayer;
    assisters: ScrapedPlayer[];
  }> = [];

  for (const line of section.split("\n")) {
    const row = line.match(/^\|\s*(.*?)\s*\|\s*(\d+)'?\s*\|\s*(.*?)\s*\|\s*$/);
    if (!row) continue;
    const minute = Number(row[2]);

    for (const [cell, side] of [
      [row[1], "home" as const],
      [row[3], "away" as const],
    ] as const) {
      if (!cell) continue;
      if (!/\(\d+-\d+\)/.test(cell)) continue;

      const players: Array<{ name: string; wsPlayerId: string; end: number }> = [];
      PLAYER_LINK_RE.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = PLAYER_LINK_RE.exec(cell)) !== null) {
        players.push({
          name: m[1],
          wsPlayerId: m[2],
          end: m.index + m[0].length,
        });
      }
      if (players.length === 0) continue;

      const scoreMatch = cell.match(/\((\d+)-(\d+)\)/);
      const scoreIdx = scoreMatch ? cell.indexOf(scoreMatch[0]) : -1;
      let scorerIdx = players.findIndex((p) => Math.abs(p.end - scoreIdx) <= 2);
      if (scorerIdx < 0) scorerIdx = 0;

      const scorer = players[scorerIdx];
      const assisters = players
        .filter((_, i) => i !== scorerIdx)
        .map((p) => ({ name: p.name, wsPlayerId: p.wsPlayerId }));

      out.push({
        side,
        minute,
        scorer: { name: scorer.name, wsPlayerId: scorer.wsPlayerId },
        assisters,
      });
    }
  }
  return out;
}

/** Pull formation like "4-3-3" from a few lines after the team section start. */
function parseFormation(md: string, teamName: string): string | null {
  const lines = md.split("\n");
  const start = findTeamSectionStart(lines, teamName);
  if (start < 0) return null;
  for (let i = start + 1; i < Math.min(start + 10, lines.length); i++) {
    const t = lines[i].trim();
    if (/^\d(?:-\d){1,4}$/.test(t)) return t;
  }
  return null;
}

/**
 * Parse the venue from a line like:
 *   stadium\_clmn\_venue: Artemio Franchistadium\_clmn\_attend:0...
 *
 * Firecrawl preserves markdown's `\_` escape, so we match the `venue:` token
 * and stop at the next `stadium\_clmn_` marker.
 */
function parseVenue(md: string): string | null {
  const m = md.match(/stadium\\?_clmn\\?_venue:\s*(.+?)stadium\\?_clmn\\?_/i);
  if (!m) return null;
  return m[1].trim().replace(/\s+/g, " ");
}

export async function scrapeMatch(url: string): Promise<ScrapedMatch> {
  const md = await fetchMarkdown(url);

  const idMatch = url.match(/\/matches\/(\d+)\//);
  const whoscoredId = idMatch ? idMatch[1] : null;

  const header = parseHeader(md);
  const scoreLine =
    header.homeScore != null && header.awayScore != null
      ? `${header.homeScore} : ${header.awayScore}`
      : "";

  // Timeline gives us scorer + assists with player IDs; team sections give
  // us the OG / Pen flags. Merge by (minute, side, surname match).
  const timelineGoals = parseTimelineGoals(md);
  const sectionFlags = [
    ...(header.home
      ? parseSectionGoalFlags(md, "home", header.home.name, scoreLine)
      : []),
    ...(header.away
      ? parseSectionGoalFlags(md, "away", header.away.name, scoreLine)
      : []),
  ];

  const goals: ScrapedGoal[] = timelineGoals.map((g) => {
    const scorerSurname = g.scorer.name.split(/\s+/).pop()?.toLowerCase() ?? "";
    const flag = sectionFlags.find(
      (f) => f.minute === g.minute && f.side === g.side && f.scorerSurname === scorerSurname,
    );
    return {
      side: g.side,
      minute: g.minute,
      scorer: g.scorer,
      assisters: g.assisters,
      ownGoal: flag?.ownGoal ?? false,
      penalty: flag?.penalty ?? false,
    };
  });

  return {
    url,
    whoscoredId,
    homeTeam: header.home?.name ?? "",
    awayTeam: header.away?.name ?? "",
    homeTeamWsId: header.home?.wsId ?? null,
    awayTeamWsId: header.away?.wsId ?? null,
    homeScore: header.homeScore,
    awayScore: header.awayScore,
    htHomeScore: header.htHomeScore,
    htAwayScore: header.htAwayScore,
    status: header.status,
    kickoffUtc: header.kickoffUtc,
    goals,
    homeFormation: header.home ? parseFormation(md, header.home.name) : null,
    awayFormation: header.away ? parseFormation(md, header.away.name) : null,
    venue: parseVenue(md),
    rawMarkdown: md,
  };
}
