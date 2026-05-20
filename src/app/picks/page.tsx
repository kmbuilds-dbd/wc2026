import { PageHeader } from "@/components/page-header";
import { ComingSoon } from "@/components/coming-soon";

export default function PicksPage() {
  return (
    <>
      <PageHeader
        eyebrow="63 picks · locks Jun 11 20:00 UTC"
        title="Your"
        highlight="picks"
        subtitle="1st & 2nd per group, 8 wildcard 3rds, every KO winner, top scorer, golden glove, winner."
      />
      <ComingSoon label="Picks UI · Day 6–8" shipBy="2026-05-26" />
    </>
  );
}
