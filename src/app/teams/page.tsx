import { getCloudflareContext } from "@opennextjs/cloudflare";
import { TeamsView } from "@/components/teams-view";
import { RefreshSquadsButton } from "@/components/refresh-squads-button";
import { trackerTeams, type TrackerTeam } from "@/data/tracker-snapshot";
import { requireUser } from "@/lib/auth";

export const metadata = {
  title: "Squad tracker — WC2026 pick'em",
  description: "All 48 nations' squads for the FIFA World Cup 2026.",
};

const KV_KEY = "squads:latest";
const KV_KEY_FETCHED_AT = "squads:latest:fetchedAt";

/**
 * Port of the wc2026_worker squad tracker into the new app.
 *
 * Read order:
 *   1. KV `squads:latest` — written by /api/admin/refresh-squads when admin
 *      clicks "refresh." Reflects live data from the legacy worker's cron.
 *   2. Bundled tracker-snapshot.json — frozen at deploy time, always available.
 */
async function loadSquads(): Promise<{
  teams: TrackerTeam[];
  fetchedAt: number | null;
}> {
  const { env } = await getCloudflareContext({ async: true });
  const cached = await env.CACHE.get(KV_KEY);
  if (cached) {
    try {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const fetchedAtRaw = await env.CACHE.get(KV_KEY_FETCHED_AT);
        const fetchedAt = fetchedAtRaw ? Number(fetchedAtRaw) : null;
        return { teams: parsed as TrackerTeam[], fetchedAt };
      }
    } catch {
      // Bad cached JSON — fall through to bundled.
    }
  }
  return { teams: trackerTeams, fetchedAt: null };
}

function fmtUtc(sec: number): string {
  return new Date(sec * 1000).toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

export default async function TeamsPage() {
  const user = await requireUser();
  const { teams, fetchedAt } = await loadSquads();

  return (
    <>
      <div className="flex items-baseline justify-between mb-4 gap-3 flex-wrap">
        <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted">
          {fetchedAt
            ? `Squads refreshed ${fmtUtc(fetchedAt)} · live KV`
            : "Squads from bundled snapshot · click refresh to pull live data"}
        </div>
        {user.isAdmin && <RefreshSquadsButton />}
      </div>
      <TeamsView teams={teams} />
    </>
  );
}
