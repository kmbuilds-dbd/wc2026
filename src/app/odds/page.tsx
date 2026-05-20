import { PageHeader } from "@/components/page-header";
import { ComingSoon } from "@/components/coming-soon";

export default function OddsPage() {
  return (
    <>
      <PageHeader
        eyebrow="3 markets · refreshed daily"
        title="Live"
        highlight="odds"
        subtitle="Tournament winner, golden boot, group winners. Sourced from The Odds API, cached in D1."
      />
      <ComingSoon label="Odds page · Day 16–17" shipBy="2026-06-05" />
    </>
  );
}
