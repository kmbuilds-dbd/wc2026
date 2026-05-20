/**
 * Visual indicator showing when a pick category locks, OR that it's already
 * locked (with the lock time).
 *
 * Renders entirely server-side — kickoff timestamps come from the locks
 * module which queries D1 (with hardcoded fallbacks if matches table is empty).
 */
import { getKickoffs, type LineupRound } from "@/lib/locks";

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
  /** Which lock point to display countdown to. */
  scope: "tournament" | "lineup";
  /** Required when scope=lineup */
  round?: LineupRound;
}

export async function LockBanner({ scope, round }: Props) {
  const k = await getKickoffs();
  const lockUtc =
    scope === "tournament"
      ? k.firstMatchUtc
      : round
        ? k[round]
        : k.firstMatchUtc;

  const nowSec = Math.floor(Date.now() / 1000);
  const locked = nowSec >= lockUtc;
  const secondsLeft = lockUtc - nowSec;

  const scopeLabel =
    scope === "tournament"
      ? "Tournament picks"
      : `Round ${round?.toUpperCase()} lineup`;

  if (locked) {
    return (
      <div className="rounded border border-danger/30 bg-danger/5 px-4 py-3 font-mono text-[11px] uppercase tracking-[0.1em] text-danger flex items-center justify-between gap-4 mb-6">
        <span>🔒 {scopeLabel} locked since {fmtUtc(lockUtc)}</span>
        <span className="text-text-muted normal-case tracking-normal text-[10px]">
          Picks are now read-only
        </span>
      </div>
    );
  }

  return (
    <div className="rounded border border-accent/30 bg-accent/5 px-4 py-3 font-mono text-[11px] uppercase tracking-[0.1em] text-accent flex items-center justify-between gap-4 mb-6">
      <span>{scopeLabel} lock in {fmtCountdown(secondsLeft)}</span>
      <span className="text-text-muted normal-case tracking-normal text-[10px]">
        Closes {fmtUtc(lockUtc)}
      </span>
    </div>
  );
}
