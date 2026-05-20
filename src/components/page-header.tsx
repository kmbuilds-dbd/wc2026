interface Props {
  eyebrow?: string;
  title: string;
  highlight?: string;
  subtitle?: string;
  children?: React.ReactNode;
}

/**
 * Title block that matches the wc2026_worker tracker's typography:
 * a small uppercase mono eyebrow over a Bebas Neue display title with
 * an optional gold accent word.
 */
export function PageHeader({ eyebrow, title, highlight, subtitle, children }: Props) {
  return (
    <header className="pb-7 border-b border-border-base mb-8 flex items-end justify-between flex-wrap gap-5">
      <div>
        {eyebrow && (
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent">
            {eyebrow}
          </div>
        )}
        <h1 className="font-display text-[clamp(40px,6vw,80px)] leading-[0.9]">
          {title}
          {highlight && <span className="text-accent"> {highlight}</span>}
        </h1>
        {subtitle && (
          <p className="text-xs text-text-muted mt-2 leading-relaxed max-w-prose">
            {subtitle}
          </p>
        )}
      </div>
      {children}
    </header>
  );
}
