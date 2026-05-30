import { eq, sql } from "drizzle-orm";
import { PageHeader } from "@/components/page-header";
import { LockBanner } from "@/components/lock-banner";
import { ScoringLegend } from "@/components/picks/scoring-legend";
import { GroupsSection } from "@/components/picks/groups-section";
import { WildcardsSection } from "@/components/picks/wildcards-section";
import { BracketSection } from "@/components/picks/bracket-section";
import { TournamentSection } from "@/components/picks/tournament-section";
import { LineupOverviewSection } from "@/components/picks/lineup-overview-section";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/db/client";
import {
  groupPicks,
  wildcardPicks,
  bracketPicks,
  lineupPicks,
  tournamentPicks,
  matches as matchesTable,
  teams,
} from "@/db/schema";
import { isLocked, getBracketWindow, getLineupWindow } from "@/lib/locks";
import { seedTeamsFromSnapshot } from "@/lib/seed/teams-from-snapshot";
import { buildBracketMatchups } from "@/lib/bracket-matchups";
import { loadOddsPickSuggestions } from "@/lib/odds/pick-suggestions";

export const metadata = {
  title: "Your picks — WC2026 pick'em",
};

export default async function PicksPage() {
  const user = await requireUser();
  const db = await getDb();

  // Bootstrap: auto-seed teams from snapshot on first visit so picks have
  // valid FK targets. Idempotent; runs at most once per app lifetime.
  const teamCount = await db
    .select({ n: sql<number>`count(*)` })
    .from(teams)
    .get();
  if ((teamCount?.n ?? 0) === 0) {
    await seedTeamsFromSnapshot();
  }

  const [
    existingGroups,
    existingWildcards,
    existingBracket,
    existingTournament,
    existingKoLineups,
    knockoutMatches,
    oddsSuggestions,
  ] =
    await Promise.all([
      db.select().from(groupPicks).where(eq(groupPicks.userEmail, user.email)),
      db.select().from(wildcardPicks).where(eq(wildcardPicks.userEmail, user.email)),
      db.select().from(bracketPicks).where(eq(bracketPicks.userEmail, user.email)),
      db
        .select()
        .from(tournamentPicks)
        .where(eq(tournamentPicks.userEmail, user.email))
        .get(),
      db
        .select()
        .from(lineupPicks)
        .where(sql`${lineupPicks.userEmail} = ${user.email} and ${lineupPicks.round} != 'group'`),
      db
        .select()
        .from(matchesTable)
        .where(sql`${matchesTable.stage} != 'group'`)
        .orderBy(matchesTable.kickoffUtc, matchesTable.id),
      loadOddsPickSuggestions(),
    ]);

  const groupInitial: Record<string, number> = {};
  for (const r of existingGroups) groupInitial[`${r.groupLetter}:${r.rank}`] = r.teamId;
  const groupTopTwoTeamIds = Array.from(new Set(existingGroups.map((r) => r.teamId)));

  const wildcardInitial: Record<number, number> = {};
  for (const r of existingWildcards) wildcardInitial[r.slot] = r.teamId;

  const bracketInitial: Record<string, number> = {};
  for (const r of existingBracket) bracketInitial[r.matchSlot] = r.teamId;
  const bracketMatchups = buildBracketMatchups(knockoutMatches);

  const tournamentInitial = {
    winnerTeamId: existingTournament?.winnerTeamId ?? null,
    topScorerPlayerId: existingTournament?.topScorerPlayerId ?? null,
    goldenGlovePlayerId: existingTournament?.goldenGlovePlayerId ?? null,
  };

  // Groups, wildcards, and tournament-level picks all lock at first kickoff.
  // Bracket + lineup have their own pending → open → locked lifecycles.
  const locked = await isLocked("group");
  const bracket = await getBracketWindow();
  const r32Lineup = await getLineupWindow("r32");

  return (
    <>
      <PageHeader
        eyebrow={`Signed in as ${user.email}`}
        title="Your"
        highlight="picks"
        subtitle="Groups, wildcards, KO bracket, tournament winner, top scorer, Golden Glove."
      />

      <LockBanner scope="tournament" />

      <ScoringLegend scope="picks" />

      {/* In-page TOC — jump between the five sections on long scroll. */}
      <nav className="flex flex-wrap gap-2 mb-8 font-mono text-[10px] uppercase tracking-[0.08em]">
        {[
          { href: "#groups", label: `Groups (${existingGroups.length}/24)` },
          { href: "#wildcards", label: `Wildcards (${existingWildcards.length}/8)` },
          { href: "#bracket", label: `Bracket (${existingBracket.length}/31)` },
          {
            href: "#tournament",
            label: `Tournament (${existingTournament ? Object.values(tournamentInitial).filter(Boolean).length : 0}/3)`,
          },
          { href: "#lineups", label: `Lineups (${existingKoLineups.length}/20)` },
        ].map((l) => (
          <a
            key={l.href}
            href={l.href}
            className="px-3 py-1.5 rounded-sm border border-border-base bg-surface text-text-muted hover:bg-accent/10 hover:text-accent hover:border-accent/30"
          >
            {l.label}
          </a>
        ))}
      </nav>

      <div id="groups" />
      <GroupsSection
        initial={groupInitial}
        locked={locked}
        oddsGroupWinners={oddsSuggestions.groupWinners}
        oddsGroupSecondPlace={oddsSuggestions.groupSecondPlace}
      />
      <div id="wildcards" />
      <WildcardsSection
        initial={wildcardInitial}
        locked={locked}
        groupTopTwoTeamIds={groupTopTwoTeamIds}
      />
      <div id="bracket" />
      <BracketSection
        initial={bracketInitial}
        bracket={bracket}
        matchups={bracketMatchups}
      />
      <div id="tournament" />
      <TournamentSection
        initial={tournamentInitial}
        locked={locked}
        oddsPicks={oddsSuggestions.tournament}
      />
      <div id="lineups" />
      <LineupOverviewSection
        r32Window={r32Lineup}
        completed={existingKoLineups.length}
      />
    </>
  );
}
