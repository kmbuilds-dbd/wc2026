"use client";

/**
 * Tournament-level picks: Winner + Top scorer + Golden Glove.
 *
 * Winner = pick 1 of 48 teams.
 * Top scorer = two-step (team → player) so the dropdown isn't ~1200 entries.
 * Golden Glove = single dropdown of all GKs across all 48 teams (~144 rows).
 */
import { useMemo, useState, useTransition } from "react";
import { saveTournamentPicks } from "@/app/(app)/picks/actions";
import { teamList, teamById } from "@/lib/teams-data";
import {
  allGoalkeepers,
  playersForTeam,
  playerById,
  type UiPlayer,
} from "@/lib/players-data";
import { SectionHeader, SaveBar } from "./shared";

interface Props {
  initial: {
    winnerTeamId: number | null;
    topScorerPlayerId: number | null;
    goldenGlovePlayerId: number | null;
  };
  locked: boolean;
}

export function TournamentSection({ initial, locked }: Props) {
  const [winner, setWinner] = useState<number | null>(initial.winnerTeamId);
  const [topScorer, setTopScorer] = useState<number | null>(initial.topScorerPlayerId);
  const [goldenGlove, setGoldenGlove] = useState<number | null>(initial.goldenGlovePlayerId);

  // Track the team picked for "top scorer" so the player dropdown filters down.
  // Default to whatever team the existing top-scorer player belongs to.
  const initialScorerTeam = initial.topScorerPlayerId
    ? playerById.get(initial.topScorerPlayerId)?.teamId ?? null
    : null;
  const [topScorerTeam, setTopScorerTeam] = useState<number | null>(initialScorerTeam);

  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const completed =
    (winner !== null ? 1 : 0) +
    (topScorer !== null ? 1 : 0) +
    (goldenGlove !== null ? 1 : 0);

  const scorerCandidates = useMemo<UiPlayer[]>(
    () => (topScorerTeam ? playersForTeam(topScorerTeam) : []),
    [topScorerTeam],
  );

  // GKs sorted by team name for findability in the long flat dropdown.
  const goalkeepers = useMemo(
    () =>
      [...allGoalkeepers].sort((a, b) => a.teamName.localeCompare(b.teamName)),
    [],
  );

  function onScorerTeamChange(teamId: number | null) {
    setTopScorerTeam(teamId);
    // If switching team, clear the player pick (it would no longer be valid).
    if (topScorer && playerById.get(topScorer)?.teamId !== teamId) {
      setTopScorer(null);
    }
    setStatus(null);
    setError(null);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (locked) return;
    setStatus(null);
    setError(null);
    const form = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await saveTournamentPicks(form);
      if (res.ok) setStatus(`Saved at ${new Date().toLocaleTimeString()}`);
      else setError(res.error);
    });
  }

  return (
    <section className="mb-12">
      <SectionHeader
        eyebrow="Section 4 of 4"
        title="Tournament-level"
        subtitle="The big three: who wins it all, who scores the most, who keeps the cleanest sheets."
        completed={completed}
        total={3}
      />

      <form onSubmit={onSubmit}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Tournament winner */}
          <div className="bg-surface border border-border-base rounded p-4">
            <div className="font-display text-base tracking-[0.1em] text-accent mb-3">
              WINNER
            </div>
            <label className="block">
              <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted">
                Champion team
              </span>
              <select
                name="winner"
                value={winner ?? ""}
                disabled={locked}
                onChange={(e) => {
                  setWinner(e.target.value ? Number(e.target.value) : null);
                  setStatus(null);
                  setError(null);
                }}
                className="mt-1 w-full bg-surface-2 border border-border-base text-text rounded-sm px-2 py-1.5 text-sm focus:border-accent/40 outline-none disabled:opacity-50"
              >
                <option value="">— pick a team —</option>
                {teamList.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.flag} {t.name}
                  </option>
                ))}
              </select>
            </label>
            {winner && (
              <div className="text-[11px] text-text-muted mt-2 italic">
                {teamById.get(winner)?.flag} {teamById.get(winner)?.name} lifts the trophy
              </div>
            )}
          </div>

          {/* Top scorer */}
          <div className="bg-surface border border-border-base rounded p-4">
            <div className="font-display text-base tracking-[0.1em] text-accent mb-3">
              TOP SCORER
            </div>
            <label className="block mb-2.5">
              <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted">
                Player&apos;s team
              </span>
              <select
                value={topScorerTeam ?? ""}
                disabled={locked}
                onChange={(e) =>
                  onScorerTeamChange(e.target.value ? Number(e.target.value) : null)
                }
                className="mt-1 w-full bg-surface-2 border border-border-base text-text rounded-sm px-2 py-1.5 text-sm focus:border-accent/40 outline-none disabled:opacity-50"
              >
                <option value="">— pick team first —</option>
                {teamList.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.flag} {t.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted">
                Player
              </span>
              <select
                name="top_scorer_player"
                value={topScorer ?? ""}
                disabled={locked || !topScorerTeam}
                onChange={(e) => {
                  setTopScorer(e.target.value ? Number(e.target.value) : null);
                  setStatus(null);
                  setError(null);
                }}
                className="mt-1 w-full bg-surface-2 border border-border-base text-text rounded-sm px-2 py-1.5 text-sm focus:border-accent/40 outline-none disabled:opacity-50"
              >
                <option value="">{topScorerTeam ? "— pick player —" : "— pick team first —"}</option>
                {scorerCandidates.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.position}{p.club ? ` · ${p.club}` : ""})
                  </option>
                ))}
              </select>
            </label>
          </div>

          {/* Golden Glove */}
          <div className="bg-surface border border-border-base rounded p-4">
            <div className="font-display text-base tracking-[0.1em] text-accent mb-3">
              GOLDEN GLOVE
            </div>
            <label className="block">
              <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted">
                Best goalkeeper ({goalkeepers.length} candidates)
              </span>
              <select
                name="golden_glove_player"
                value={goldenGlove ?? ""}
                disabled={locked}
                onChange={(e) => {
                  setGoldenGlove(e.target.value ? Number(e.target.value) : null);
                  setStatus(null);
                  setError(null);
                }}
                className="mt-1 w-full bg-surface-2 border border-border-base text-text rounded-sm px-2 py-1.5 text-sm focus:border-accent/40 outline-none disabled:opacity-50"
              >
                <option value="">— pick a GK —</option>
                {goalkeepers.map((gk) => (
                  <option key={gk.id} value={gk.id}>
                    {gk.name} ({gk.teamName})
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <SaveBar
          locked={locked}
          isPending={isPending}
          status={status}
          error={error}
          completed={completed}
          total={3}
          saveLabel="Save tournament picks"
        />
      </form>
    </section>
  );
}
