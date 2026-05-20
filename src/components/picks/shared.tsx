"use client";

/**
 * Shared UI bits across pick sections so they look + behave the same.
 * Each pick section has: an eyebrow + title + progress, a body of inputs,
 * and a sticky save bar at the bottom.
 */

export function SectionHeader({
  eyebrow,
  title,
  subtitle,
  completed,
  total,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  completed: number;
  total: number;
}) {
  return (
    <div className="mb-5">
      <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent">
        {eyebrow} · {completed}/{total} done
      </div>
      <h2 className="font-display text-3xl text-text mt-1">{title}</h2>
      <p className="text-xs text-text-muted mt-1">{subtitle}</p>
    </div>
  );
}

export function SaveBar({
  locked,
  isPending,
  status,
  error,
  completed,
  total,
  saveLabel,
}: {
  locked: boolean;
  isPending: boolean;
  status: string | null;
  error: string | null;
  completed: number;
  total: number;
  saveLabel: string;
}) {
  return (
    <div className="sticky bottom-0 mt-5 -mx-5 px-5 py-3 bg-bg/95 backdrop-blur border-t border-border-base flex items-center justify-between gap-4 z-10">
      <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted">
        {completed}/{total} picks ·{" "}
        {error ? (
          <span className="text-danger normal-case tracking-normal">{error}</span>
        ) : status ? (
          <span className="text-confirmed normal-case tracking-normal">{status}</span>
        ) : (
          <span className="normal-case tracking-normal">Unsaved changes won&apos;t persist</span>
        )}
      </div>
      <button
        type="submit"
        disabled={locked || isPending}
        className="font-mono text-[11px] uppercase tracking-[0.1em] px-4 py-2 bg-accent text-bg rounded-sm hover:bg-accent/90 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {locked ? "Locked" : isPending ? "Saving…" : saveLabel}
      </button>
    </div>
  );
}
