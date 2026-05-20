interface Props {
  label: string;
  shipBy?: string;
}

/**
 * Day-1 placeholder for routes that exist in the routing tree but whose
 * implementation lands in a later sprint block.
 */
export function ComingSoon({ label, shipBy }: Props) {
  return (
    <div className="rounded border border-border-base bg-surface p-8 text-center">
      <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-text-muted mb-2">
        {label}
      </div>
      <div className="font-display text-3xl text-text">Coming soon</div>
      {shipBy && (
        <div className="font-mono text-[10px] uppercase tracking-[0.15em] text-text-dim mt-3">
          ship target · {shipBy}
        </div>
      )}
    </div>
  );
}
