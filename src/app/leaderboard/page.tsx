import { PageHeader } from "@/components/page-header";
import { ComingSoon } from "@/components/coming-soon";

export default function LeaderboardPage() {
  return (
    <>
      <PageHeader
        eyebrow="Live · auto-refresh every 5 min"
        title="Leader"
        highlight="board"
        subtitle="Group + bracket + lineup + tournament points. Re-scored idempotently after every match."
      />
      <ComingSoon label="Leaderboard · Day 9–11" shipBy="2026-05-29" />
    </>
  );
}
