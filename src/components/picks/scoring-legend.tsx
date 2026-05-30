/**
 * Collapsible scoring legend shown on /picks and on each
 * /picks/lineup/[round] page. Values pulled live from RULES so the legend
 * can never drift from actual scoring.
 */
import { RULES } from "@/lib/scoring/rules";

interface Props {
  scope: "picks" | "lineup";
}

function Row({ label, pts }: { label: string; pts: number }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1 border-b border-border-base/40 last:border-0">
      <span className="text-text">{label}</span>
      <span className="font-mono text-accent shrink-0">
        +{pts} <span className="text-text-muted text-[10px]">pts</span>
      </span>
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted mb-1.5">
        {title}
      </div>
      <div>{children}</div>
    </div>
  );
}

export function ScoringLegend({ scope }: Props) {
  return (
    <details className="mb-6 rounded border border-border-base bg-surface group">
      <summary className="cursor-pointer list-none px-4 py-3 font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted hover:text-accent flex items-center justify-between">
        <span>How points are scored</span>
        <span className="text-accent text-[14px] leading-none transition-transform group-open:rotate-45">
          +
        </span>
      </summary>
      <div className="border-t border-border-base p-4 text-sm space-y-4">
        {scope === "picks" ? <PicksRules /> : <LineupRules />}
      </div>
    </details>
  );
}

function PicksRules() {
  return (
    <>
      <Group title="Groups · per pick">
        <Row label="Exact — right team, right rank" pts={RULES.GROUP_PICK_EXACT} />
        <Row label="Top-2 but wrong order" pts={RULES.GROUP_PICK_TOP2_WRONG_ORDER} />
      </Group>
      <Group title="Wildcards · per pick">
        <Row label="Picked team advances as a best-3rd" pts={RULES.WILDCARD_CORRECT} />
      </Group>
      <Group title="Bracket · per correct winner">
        <Row label="Round of 32" pts={RULES.BRACKET_R32} />
        <Row label="Round of 16" pts={RULES.BRACKET_R16} />
        <Row label="Quarter-final" pts={RULES.BRACKET_QF} />
        <Row label="Semi-final" pts={RULES.BRACKET_SF} />
        <Row label="Final" pts={RULES.BRACKET_FINAL} />
      </Group>
      <Group title="Tournament · per pick">
        <Row label="Winner pick — team lifts trophy" pts={RULES.TOURNAMENT_WINNER} />
        <Row label="Winner pick — team loses the Final" pts={RULES.TOURNAMENT_FINALIST} />
        <Row label="Top scorer" pts={RULES.TOP_SCORER} />
        <Row label="Golden Glove" pts={RULES.GOLDEN_GLOVE} />
      </Group>
    </>
  );
}

function LineupRules() {
  return (
    <>
      <Group title="Attacking · per event">
        <Row label="Goal scored by your player" pts={RULES.LINEUP_GOAL} />
        <Row label="Assist by your player" pts={RULES.LINEUP_ASSIST} />
      </Group>
      <Group title="Clean sheets · per match">
        <Row label="GK — team kept a clean sheet" pts={RULES.LINEUP_CLEAN_SHEET_GK} />
        <Row label="DEF — team kept a clean sheet" pts={RULES.LINEUP_CLEAN_SHEET_DEF} />
      </Group>
      <div className="font-mono text-[10px] text-text-muted leading-relaxed pt-1">
        Points accumulate across every match the player&apos;s team plays in this round.
        Own goals don&apos;t score for the scorer.
      </div>
    </>
  );
}
