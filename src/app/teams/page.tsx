import { TeamsView } from "@/components/teams-view";
import { trackerTeams } from "@/data/tracker-snapshot";

export const metadata = {
  title: "Squad tracker — WC2026 pick'em",
  description: "All 48 nations' squads for the FIFA World Cup 2026.",
};

/**
 * Port of the wc2026_worker squad tracker into the new app.
 *
 * Reads the bundled snapshot directly — no DB call yet. When the data
 * source is finalized (api-football Pro or hybrid manual), this page will
 * fall back to teams.api_sports_data from D1 if present, then snapshot.
 */
export default function TeamsPage() {
  return <TeamsView teams={trackerTeams} />;
}
