const FOTMOB_ORIGIN = "https://www.fotmob.com";
const WC2026_FIXTURES_URL = `${FOTMOB_ORIGIN}/leagues/77/fixtures/world-cup`;

export interface ScrapedFixture {
  externalMatchId: string;
  matchUrl: string;
  homeTeam: string;
  awayTeam: string;
  homeTeamWsId: string;
  awayTeamWsId: string;
  kickoffUtc: number | null;
  stageLabel: string | null;
  status: "scheduled" | "live" | "finished";
  homeScore: number | null;
  awayScore: number | null;
}

export interface DiscoverAllResult {
  fixtures: ScrapedFixture[];
  stages: Array<{ stageId: number; url: string; label: string | null; count: number; error?: string }>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cleanText(value: unknown) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function parseScore(scoreStr: unknown) {
  const match = cleanText(scoreStr).match(/^(\d+)\s*-\s*(\d+)$/);
  if (!match) return { homeScore: null, awayScore: null };
  return { homeScore: Number(match[1]), awayScore: Number(match[2]) };
}

function parseStatus(raw: unknown): ScrapedFixture["status"] {
  if (!isRecord(raw)) return "scheduled";
  if (raw.finished === true) return "finished";
  if (raw.started === true) return "live";
  return "scheduled";
}

function absoluteFotmobUrl(value: unknown) {
  const raw = cleanText(value);
  if (!raw) return "";
  if (raw.startsWith("https://www.fotmob.com/")) return raw;
  if (raw.startsWith("/")) return `${FOTMOB_ORIGIN}${raw}`;
  return `${FOTMOB_ORIGIN}/${raw}`;
}

async function fetchFotmobPage(url: string) {
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

  const parsed = JSON.parse(match[1]) as { props?: { pageProps?: Record<string, unknown> } };
  if (!parsed.props?.pageProps) throw new Error(`FotMob page had no pageProps: ${url}`);
  return parsed.props.pageProps;
}

function allMatches(pageProps: Record<string, unknown>) {
  const fixtures = isRecord(pageProps.fixtures) ? pageProps.fixtures : {};
  if (Array.isArray(fixtures.allMatches)) return fixtures.allMatches;

  const overview = isRecord(pageProps.overview) ? pageProps.overview : {};
  const matches = isRecord(overview.matches) ? overview.matches : {};
  return Array.isArray(matches.allMatches) ? matches.allMatches : [];
}

function mapFixture(raw: unknown): ScrapedFixture | null {
  if (!isRecord(raw)) return null;
  const home = isRecord(raw.home) ? raw.home : null;
  const away = isRecord(raw.away) ? raw.away : null;
  const status = isRecord(raw.status) ? raw.status : null;

  const id = cleanText(raw.id);
  const homeTeam = cleanText(home?.name);
  const awayTeam = cleanText(away?.name);
  const utcTime = cleanText(status?.utcTime);
  if (!id || !homeTeam || !awayTeam) return null;

  const kickoffUtc = utcTime ? Math.floor(Date.parse(utcTime) / 1000) : null;
  const { homeScore, awayScore } = parseScore(status?.scoreStr);
  const group = cleanText(raw.group);

  return {
    externalMatchId: id,
    matchUrl: absoluteFotmobUrl(raw.pageUrl),
    homeTeam,
    awayTeam,
    homeTeamWsId: cleanText(home?.id),
    awayTeamWsId: cleanText(away?.id),
    kickoffUtc: Number.isFinite(kickoffUtc) ? kickoffUtc : null,
    stageLabel: group ? `Group ${group}` : cleanText(raw.roundName) || null,
    status: parseStatus(status),
    homeScore,
    awayScore,
  };
}

export function deriveStage(
  stageLabel: string | null,
  kickoffUtc: number | null,
): { stage: "group" | "r32" | "r16" | "qf" | "sf" | "final" | "3p"; groupLetter: string | null } {
  if (stageLabel?.startsWith("Group ")) {
    const letter = stageLabel.replace(/^Group\s+/i, "").trim().charAt(0).toUpperCase();
    return { stage: "group", groupLetter: letter || null };
  }
  if (kickoffUtc == null) return { stage: "r32", groupLetter: null };
  const d = new Date(kickoffUtc * 1000);
  const md = (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
  if (md >= 628 && md <= 703) return { stage: "r32", groupLetter: null };
  if (md >= 704 && md <= 707) return { stage: "r16", groupLetter: null };
  if (md >= 709 && md <= 711) return { stage: "qf", groupLetter: null };
  if (md >= 714 && md <= 715) return { stage: "sf", groupLetter: null };
  if (md === 718) return { stage: "3p", groupLetter: null };
  if (md === 719) return { stage: "final", groupLetter: null };
  return { stage: "r32", groupLetter: null };
}

export async function discoverAllWcFixtures(): Promise<DiscoverAllResult> {
  const fixtures: ScrapedFixture[] = [];
  const stages: DiscoverAllResult["stages"] = [];

  try {
    const pageProps = await fetchFotmobPage(WC2026_FIXTURES_URL);
    const rows = allMatches(pageProps)
      .map(mapFixture)
      .filter((fixture): fixture is ScrapedFixture => fixture !== null);

    fixtures.push(...rows);
    stages.push({
      stageId: 77,
      url: WC2026_FIXTURES_URL,
      label: "FIFA World Cup 2026",
      count: rows.length,
    });
  } catch (e) {
    stages.push({
      stageId: 77,
      url: WC2026_FIXTURES_URL,
      label: "FIFA World Cup 2026",
      count: 0,
      error: e instanceof Error ? e.message : String(e),
    });
  }

  return { fixtures, stages };
}
