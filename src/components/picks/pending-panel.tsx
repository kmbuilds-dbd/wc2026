/**
 * "Coming soon" panel shown when a pick category is in its `pending` window
 * (i.e., before its opens-at timestamp). Used by both the bracket section
 * and the per-round lineup pages.
 */

function fmtUtc(sec: number): string {
  return new Date(sec * 1000).toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

function fmtCountdown(secondsLeft: number): string {
  if (secondsLeft <= 0) return "now";
  const days = Math.floor(secondsLeft / 86_400);
  const hours = Math.floor((secondsLeft % 86_400) / 3_600);
  if (days >= 2) return `${days} days`;
  if (days >= 1) return `${days}d ${hours}h`;
  return `${hours}h`;
}

interface Props {
  opensAt: number;
  title: string;
  explainer: string;
}

export function PendingPanel({ opensAt, title, explainer }: Props) {
  const secondsLeft = opensAt - Math.floor(Date.now() / 1000);
  return (
    <div className="bg-surface border border-border-base rounded p-8 text-center">
      <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-text-muted mb-3">
        🔒 Opens in {fmtCountdown(secondsLeft)}
      </div>
      <div className="font-display text-2xl text-text mb-2">{title}</div>
      <div className="text-sm text-text-muted max-w-md mx-auto">
        {explainer} <span className="text-accent">{fmtUtc(opensAt)}</span>.
      </div>
    </div>
  );
}
