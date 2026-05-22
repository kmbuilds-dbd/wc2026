import { PageHeader } from "@/components/page-header";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/db/client";
import { matches, type Match } from "@/db/schema";
import { teamById } from "@/lib/teams-data";
import { playerById } from "@/lib/players-data";
import type { MatchEvent } from "@/lib/scoring/compute";

export const metadata = {
  title: "Matches & results — WC2026 pick'em",
};

const STAGE_ORDER = ["group", "r32", "r16", "qf", "sf", "3p", "final"] as const;
const STAGE_LABEL: Record<Match["stage"], string> = {
  group: "Group stage",
  r32: "Round of 32",
  r16: "Round of 16",
  qf: "Quarter-finals",
  sf: "Semi-finals",
  "3p": "Third-place playoff",
  final: "Final",
};

function fmtUtc(sec: number): string {
  return new Date(sec * 1000).toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

function teamLabel(id: number | null): string {
  if (id == null) return "TBD";
  const t = teamById.get(id);
  return t ? `${t.flag} ${t.name}` : `#${id}`;
}

function playerLabel(id: number): string {
  const p = playerById.get(id);
  return p?.name ?? `#${id}`;
}

export default async function MatchesPage() {
  await requireUser();
  const db = await getDb();
  const rows = await db.select().from(matches).orderBy(matches.kickoffUtc);

  if (rows.length === 0) {
    return (
      <>
        <PageHeader
          eyebrow="Tournament-wide match log"
          title="Matches"
          highlight="& results"
          subtitle="Every fixture, score, and event that feeds into your pick + lineup scoring."
        />
        <div className="rounded border border-border-base bg-surface p-8 text-center">
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-text-muted mb-2">
            No fixtures seeded yet
          </div>
          <div className="font-display text-2xl text-text">
            Schedule lands once the data provider is wired
          </div>
          <div className="text-xs text-text-muted mt-2 max-w-md mx-auto">
            Once <code className="text-accent">/api/admin/seed?what=fixtures</code> runs (or
            an admin POSTs results directly), match cards will populate below.
          </div>
        </div>
      </>
    );
  }

  // ─── Rollup aggregates ────────────────────────────────────────────────
  const finishedMatches = rows.filter((m) => m.status === "finished");

  const goalsByPlayer = new Map<number, number>();
  const assistsByPlayer = new Map<number, number>();
  const cleanSheetsByTeam = new Map<number, number>();
  for (const m of finishedMatches) {
    const events = (m.rawEvents as MatchEvent[] | null) ?? [];
    for (const ev of events) {
      if (ev.type === "goal") {
        goalsByPlayer.set(ev.playerId, (goalsByPlayer.get(ev.playerId) ?? 0) + 1);
      } else if (ev.type === "assist") {
        assistsByPlayer.set(ev.playerId, (assistsByPlayer.get(ev.playerId) ?? 0) + 1);
      }
    }
    if (m.homeScore != null && m.awayScore != null) {
      if (m.awayScore === 0 && m.homeTeamId != null) {
        cleanSheetsByTeam.set(m.homeTeamId, (cleanSheetsByTeam.get(m.homeTeamId) ?? 0) + 1);
      }
      if (m.homeScore === 0 && m.awayTeamId != null) {
        cleanSheetsByTeam.set(m.awayTeamId, (cleanSheetsByTeam.get(m.awayTeamId) ?? 0) + 1);
      }
    }
  }

  const topScorers = [...goalsByPlayer.entries()]
    .sort((a, b) => b[1] - a[1] || (assistsByPlayer.get(b[0]) ?? 0) - (assistsByPlayer.get(a[0]) ?? 0))
    .slice(0, 10);

  const cleanSheetLeaders = [...cleanSheetsByTeam.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  // ─── Group matches by stage / group letter ────────────────────────────
  const groupedByKey = new Map<string, Match[]>();
  for (const m of rows) {
    const key = m.stage === "group" ? `group_${m.groupLetter ?? "?"}` : m.stage;
    const arr = groupedByKey.get(key) ?? [];
    arr.push(m);
    groupedByKey.set(key, arr);
  }
  // Stable sort order: group A..L first, then KO rounds in order
  const groupKeys = [...groupedByKey.keys()]
    .filter((k) => k.startsWith("group_"))
    .sort();
  const koKeys = (STAGE_ORDER as readonly string[]).filter(
    (s) => s !== "group" && groupedByKey.has(s),
  );

  return (
    <>
      <PageHeader
        eyebrow={`${finishedMatches.length} finished · ${rows.length - finishedMatches.length} upcoming`}
        title="Matches"
        highlight="& results"
        subtitle="Every fixture, score, and scoring-relevant event."
      />

      {/* Rollups */}
      {(topScorers.length > 0 || cleanSheetLeaders.length > 0) && (
        <section className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-10">
          {topScorers.length > 0 && (
            <div className="bg-surface border border-border-base rounded p-4">
              <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted mb-2">
                Top scorers · live leaderboard
              </div>
              <table className="w-full text-sm">
                <tbody>
                  {topScorers.map(([playerId, goals], i) => {
                    const p = playerById.get(playerId);
                    const team = p ? teamById.get(p.teamId) : null;
                    return (
                      <tr key={playerId} className="border-b border-border-base/40 last:border-0">
                        <td className="py-1 pr-2 font-mono text-text-muted text-[10px]">{i + 1}</td>
                        <td className="py-1 text-text">{playerLabel(playerId)}</td>
                        <td className="py-1 text-text-muted text-xs">{team?.flag ?? ""}</td>
                        <td className="py-1 text-right font-mono text-accent">
                          {goals} <span className="text-text-muted text-[10px]">G</span>
                        </td>
                        <td className="py-1 text-right font-mono text-text-muted text-xs">
                          {assistsByPlayer.get(playerId) ?? 0} A
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {cleanSheetLeaders.length > 0 && (
            <div className="bg-surface border border-border-base rounded p-4">
              <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted mb-2">
                Clean sheets · Golden Glove race
              </div>
              <table className="w-full text-sm">
                <tbody>
                  {cleanSheetLeaders.map(([teamId, cs], i) => (
                    <tr key={teamId} className="border-b border-border-base/40 last:border-0">
                      <td className="py-1 pr-2 font-mono text-text-muted text-[10px]">{i + 1}</td>
                      <td className="py-1 text-text">{teamLabel(teamId)}</td>
                      <td className="py-1 text-right font-mono text-accent">
                        {cs} <span className="text-text-muted text-[10px]">CS</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* Group stage sections */}
      {groupKeys.length > 0 && (
        <section className="mb-10">
          <h2 className="font-display text-2xl text-text mb-3">{STAGE_LABEL.group}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {groupKeys.map((key) => {
              const letter = key.replace("group_", "");
              return (
                <StageBlock
                  key={key}
                  title={`Group ${letter}`}
                  matches={groupedByKey.get(key)!}
                />
              );
            })}
          </div>
        </section>
      )}

      {/* KO sections */}
      {koKeys.map((stage) => (
        <section key={stage} className="mb-10">
          <h2 className="font-display text-2xl text-text mb-3">
            {STAGE_LABEL[stage as Match["stage"]]}
          </h2>
          <StageBlock matches={groupedByKey.get(stage)!} />
        </section>
      ))}
    </>
  );
}

function StageBlock({ title, matches }: { title?: string; matches: Match[] }) {
  return (
    <div className="bg-surface border border-border-base rounded">
      {title && (
        <div className="px-4 py-2 border-b border-border-base font-display text-base tracking-[0.1em] text-accent">
          {title.toUpperCase()}
        </div>
      )}
      <div className="divide-y divide-border-base/50">
        {matches.map((m) => (
          <MatchRow key={m.id} match={m} />
        ))}
      </div>
    </div>
  );
}

function MatchRow({ match }: { match: Match }) {
  const events = (match.rawEvents as MatchEvent[] | null) ?? [];
  const sortedEvents = [...events].sort((a, b) => (a.minute ?? 999) - (b.minute ?? 999));
  const isFinished = match.status === "finished";
  const hasEvents = sortedEvents.length > 0;
  const cleanSheetTeam =
    isFinished && match.homeScore != null && match.awayScore != null
      ? match.awayScore === 0
        ? match.homeTeamId
        : match.homeScore === 0
          ? match.awayTeamId
          : null
      : null;

  return (
    <div className="px-4 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1 min-w-0 text-sm text-text truncate">
          {teamLabel(match.homeTeamId)}
        </div>
        <div className="font-mono text-sm shrink-0 px-2">
          {isFinished && match.homeScore != null && match.awayScore != null ? (
            <span className="text-accent">
              {match.homeScore}<span className="text-text-muted">–</span>{match.awayScore}
            </span>
          ) : (
            <span className="text-text-muted text-[10px] uppercase tracking-[0.1em]">
              {fmtUtc(match.kickoffUtc)}
            </span>
          )}
        </div>
        <div className="flex-1 min-w-0 text-sm text-text text-right truncate">
          {teamLabel(match.awayTeamId)}
        </div>
      </div>
      {isFinished && (hasEvents || cleanSheetTeam != null) && (
        <details className="mt-1 group">
          <summary className="cursor-pointer list-none font-mono text-[10px] uppercase tracking-[0.1em] text-text-muted hover:text-accent inline-flex items-center gap-1.5">
            <span>events</span>
            <span className="text-accent transition-transform group-open:rotate-45">+</span>
          </summary>
          <div className="mt-2 pl-3 border-l border-border-base/60 space-y-0.5 font-mono text-[11px] text-text-muted">
            {sortedEvents.map((ev, i) => (
              <EventLine key={i} event={ev} />
            ))}
            {cleanSheetTeam != null && (
              <div className="text-text">
                <span className="text-accent">🛡</span> Clean sheet — {teamLabel(cleanSheetTeam)}
              </div>
            )}
          </div>
        </details>
      )}
    </div>
  );
}

function EventLine({ event }: { event: MatchEvent }) {
  const min = event.minute != null ? `${event.minute}'` : "—";
  const team = teamById.get(event.teamId);
  const teamFlag = team?.flag ?? "";
  if (event.type === "goal") {
    return (
      <div className="text-text">
        <span className="text-text-muted">{min}</span> <span className="text-accent">⚽</span>{" "}
        {playerLabel(event.playerId)} <span className="text-text-muted">{teamFlag}</span>
      </div>
    );
  }
  if (event.type === "assist") {
    return (
      <div>
        <span className="text-text-muted">{min}</span> <span>🅰</span>{" "}
        {playerLabel(event.playerId)} <span>{teamFlag}</span>
      </div>
    );
  }
  // own_goal
  return (
    <div className="text-danger">
      <span className="text-text-muted">{min}</span> ⚽ OG — {playerLabel(event.playerId)}{" "}
      <span>{teamFlag}</span>
    </div>
  );
}

