import { PageHeader } from "@/components/page-header";
import { FIRST_KICKOFF_UTC } from "@/lib/locks";
import { getUserEmail } from "@/lib/auth";

function daysUntilKickoff() {
  const diff = FIRST_KICKOFF_UTC * 1000 - Date.now();
  return Math.max(0, Math.ceil(diff / (24 * 60 * 60 * 1000)));
}

export default async function DashboardPage() {
  const email = await getUserEmail();
  const days = daysUntilKickoff();

  return (
    <>
      <PageHeader
        eyebrow="Closed group · 50 max"
        title="Pick the"
        highlight="World"
        subtitle="48 nations. Three group-stage rounds, then knockouts. Bracket locks at first kickoff."
      >
        <div className="flex flex-col items-end gap-2">
          <span className="inline-flex items-center gap-1.5 font-mono text-[10px] px-2.5 py-1 rounded-full bg-confirmed/10 border border-confirmed/25 text-confirmed">
            <span className="wc-live-dot" />
            LIVE
          </span>
          <div className="font-mono text-[10px] text-text-muted text-right leading-relaxed">
            Bracket locks in
            <br />
            <span className="text-accent font-mono text-base">
              {days} {days === 1 ? "day" : "days"}
            </span>
          </div>
        </div>
      </PageHeader>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card href="/picks" label="Your picks" desc="Groups, wildcards, bracket, top scorer, golden glove, winner." />
        <Card href="/leaderboard" label="Leaderboard" desc="Live standings across the group." />
        <Card href="/teams" label="Squad tracker" desc="All 48 nations' final 26-man lists, status, omissions." />
        <Card href="/odds" label="Live odds" desc="Tournament winner, top scorer, group winners. Daily refresh." />
        <Card
          href={email ? `/users/${encodeURIComponent(email)}` : "#"}
          label="Your locked roster"
          desc="Visible to others after each category locks."
        />
        <Card
          href="/picks/lineup/group"
          label="Lineup picks"
          desc="1 GK · 1 DEF · 1 MID · 1 FWD for the group stage and each KO round. Pool: teams still alive."
        />
      </div>

      <div className="mt-10 rounded border border-border-base bg-surface p-5 font-mono text-[11px] text-text-muted leading-relaxed">
        Signed in as{" "}
        <span className="text-text">{email ?? "(not yet — visit will trigger CF Access PIN)"}</span>
      </div>
    </>
  );
}

function Card({ href, label, desc }: { href: string; label: string; desc: string }) {
  return (
    <a
      href={href}
      className="block rounded border border-border-base bg-surface p-5 hover:border-accent/30 transition-colors"
    >
      <div className="font-mono text-[10px] uppercase tracking-[0.15em] text-text-muted mb-1.5">
        →
      </div>
      <div className="font-display text-2xl text-text leading-tight">{label}</div>
      <div className="text-xs text-text-muted mt-2 leading-relaxed">{desc}</div>
    </a>
  );
}
