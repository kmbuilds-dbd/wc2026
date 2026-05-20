/**
 * Match api-sports team names against the tracker snapshot's team names.
 *
 * Strategy: aggressive normalization (lowercase, strip accents, drop common
 * punctuation/connectors), then a small alias map for known divergences
 * between the two providers. If a team can't be matched, the seed script
 * logs it and continues — the row still inserts with whatever name we have.
 */
import { trackerByName, trackerTeams, type TrackerTeam } from "@/data/tracker-snapshot";

/** Lowercased, accent-stripped, punctuation-collapsed form. */
export function normalizeName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\b(and|the|of|republic)\b/g, "")
    .replace(/[&'.\-_]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Hand-curated aliases for the few teams whose names differ meaningfully
 * between api-sports and the tracker snapshot. LHS is the api-sports name
 * (post-normalize); RHS is the tracker name (post-normalize).
 */
const ALIASES: Record<string, string> = {
  // api-sports often uses "Korea Republic" for South Korea
  "korea": "south korea",
  // api-sports may use "United States" or "USA"
  "united states": "usa",
  // api-sports uses "Cote D'Ivoire"
  "cote divoire": "ivory coast",
  // DR Congo
  "congo dr": "dr congo",
  // Czechia vs Czech Republic
  "czechia": "czech",
  "czech": "czech",
  // Bosnia spelling
  "bosnia herzegovina": "bosnia herzegovina",
};

const trackerNormalized: Map<string, TrackerTeam> = new Map(
  trackerTeams.map((t) => [normalizeName(t.n), t]),
);

export function findTrackerTeam(apiSportsName: string): TrackerTeam | undefined {
  const lower = apiSportsName.toLowerCase().trim();
  if (trackerByName.has(lower)) return trackerByName.get(lower);

  const norm = normalizeName(apiSportsName);
  if (trackerNormalized.has(norm)) return trackerNormalized.get(norm);

  const aliased = ALIASES[norm];
  if (aliased && trackerNormalized.has(aliased)) {
    return trackerNormalized.get(aliased);
  }

  // Substring fallback — only when one normalized name fully contains the other
  for (const [tNorm, team] of trackerNormalized.entries()) {
    if (tNorm.includes(norm) || norm.includes(tNorm)) return team;
  }

  return undefined;
}
