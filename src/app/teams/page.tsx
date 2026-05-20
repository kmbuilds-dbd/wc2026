import { PageHeader } from "@/components/page-header";
import { ComingSoon } from "@/components/coming-soon";

export default function TeamsPage() {
  return (
    <>
      <PageHeader
        eyebrow="All 48 nations · USA / Canada / Mexico"
        title="Squad"
        highlight="tracker"
        subtitle="Migrated from the wc2026_worker tracker. Confirmed / preliminary / pending status, omissions, first-game line."
      />
      <ComingSoon label="Tracker port · Day 4–5" shipBy="2026-05-23" />
    </>
  );
}
