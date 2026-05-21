import type { Metadata } from "next";
import { Bebas_Neue, DM_Sans, DM_Mono } from "next/font/google";
import "./globals.css";

const bebas = Bebas_Neue({
  variable: "--font-display-raw",
  weight: "400",
  subsets: ["latin"],
  display: "swap",
});

const dmSans = DM_Sans({
  variable: "--font-sans-raw",
  subsets: ["latin"],
  display: "swap",
});

const dmMono = DM_Mono({
  variable: "--font-mono-raw",
  weight: ["400", "500"],
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "WC2026 — Pick'em",
  description: "Closed-group FIFA World Cup 2026 predictions.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${bebas.variable} ${dmSans.variable} ${dmMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-bg text-text">
        <header className="border-b border-border-base px-5 py-4 flex flex-wrap items-center justify-between gap-3">
          <a href="/" className="flex items-center gap-3 no-underline">
            <span className="font-display text-2xl tracking-wide">
              WC<span className="text-accent">2026</span>
            </span>
            <span className="hidden sm:inline-block font-mono text-[10px] uppercase tracking-[0.2em] text-text-muted">
              Pick&apos;em
            </span>
          </a>
          <nav className="font-mono text-[11px] uppercase tracking-[0.12em] flex flex-wrap gap-4 text-text-muted">
            <a href="/picks" className="hover:text-accent">
              Picks
            </a>
            <a href="/leaderboard" className="hover:text-accent">
              Leaderboard
            </a>
            <a href="/teams" className="hover:text-accent">
              Teams
            </a>
            <a href="/odds" className="hover:text-accent">
              Odds
            </a>
          </nav>
        </header>
        <main className="flex-1 px-5 py-8 max-w-[1400px] mx-auto w-full">
          {children}
        </main>
        <footer className="px-5 py-4 border-t border-border-base font-mono text-[10px] uppercase tracking-[0.15em] text-text-dim">
          All 48 Nations · USA / Canada / Mexico · Jun 11 – Jul 19 2026
        </footer>
      </body>
    </html>
  );
}
