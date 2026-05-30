import { TeamsView } from "@/components/teams-view";
import { RefreshSquadsButton } from "@/components/refresh-squads-button";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { requireUser } from "@/lib/auth";
import { loadSquads } from "@/lib/squads/refresh";

export const metadata = {
  title: "Squad tracker — WC2026 pick'em",
  description: "All 48 nations' squads for the FIFA World Cup 2026.",
};

/**
 * Port of the wc2026_worker squad tracker into the new app.
 *
 * Read order:
 *   1. KV `squads:latest` — written by /api/admin/refresh-squads.
 *   2. KV `teams` — legacy tracker key, including double-serialized values.
 *   3. Bundled tracker-snapshot.json — frozen at deploy time, always available.
 */
function fmtUtc(sec: number): string {
  return new Date(sec * 1000).toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

export default async function TeamsPage() {
  const user = await requireUser();
  const { env } = await getCloudflareContext({ async: true });
  const canRefreshSquads =
    env.ADMIN_EMAIL?.toLowerCase() === user.email.toLowerCase();
  const { teams, fetchedAt, source, meta } = await loadSquads();

  return (
    <>
      <div className="flex items-baseline justify-between mb-4 gap-3 flex-wrap">
        <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted">
          {fetchedAt
            ? `Squads refreshed ${fmtUtc(fetchedAt)} · live KV`
            : source === "legacy-kv"
              ? `Squads from tracker KV${meta.lastUpdated ? ` · updated ${meta.lastUpdated}` : ""}`
              : "Squads from bundled snapshot · click refresh to pull live data"}
        </div>
        {canRefreshSquads && <RefreshSquadsButton />}
      </div>
      <TeamsView teams={teams} />
    </>
  );
}
