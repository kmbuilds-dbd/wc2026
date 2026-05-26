"use client";

import { usePathname } from "next/navigation";
import { SignOutButton, useUser } from "@clerk/nextjs";

const NAV_LINKS = [
  { href: "/picks", label: "Picks" },
  { href: "/matches", label: "Matches" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/teams", label: "Teams" },
  { href: "/odds", label: "Odds" },
];

export function NavBar() {
  const pathname = usePathname();
  const { user } = useUser();
  const email = user?.emailAddresses[0]?.emailAddress;

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
      {email && (
        <span className="text-text-dim normal-case tracking-normal ml-auto">{email}</span>
      )}
      <SignOutButton redirectUrl="/join">
        <button className="hover:text-accent cursor-pointer bg-transparent border-0 p-0 font-mono text-[11px] uppercase tracking-[0.12em] text-text-muted">
          Sign out
        </button>
      </SignOutButton>
    </nav>
  );
}
