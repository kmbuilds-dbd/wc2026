"use client";

import { usePathname } from "next/navigation";

const NAV_LINKS = [
  { href: "/picks", label: "Picks" },
  { href: "/matches", label: "Matches" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/teams", label: "Teams" },
  { href: "/odds", label: "Odds" },
];

export function NavBar() {
  const pathname = usePathname();
  return (
    <nav className="font-mono text-[11px] uppercase tracking-[0.12em] flex flex-wrap gap-4 text-text-muted">
      {NAV_LINKS.map(({ href, label }) => {
        const active = pathname === href || pathname.startsWith(href + "/");
        return (
          <a
            key={href}
            href={href}
            className={active ? "text-accent" : "hover:text-accent"}
          >
            {label}
          </a>
        );
      })}
    </nav>
  );
}
