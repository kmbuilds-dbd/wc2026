import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { ComingSoon } from "@/components/coming-soon";
import type { LineupRound } from "@/lib/locks";

const ROUNDS = ["r32", "r16", "qf", "sf", "final"] as const;
const LABELS: Record<LineupRound, string> = {
  r32: "Round of 32",
  r16: "Round of 16",
  qf: "Quarter-finals",
  sf: "Semi-finals",
  final: "Final",
};

export default async function LineupRoundPage({
  params,
}: {
  params: Promise<{ round: string }>;
}) {
  const { round } = await params;
  if (!ROUNDS.includes(round as LineupRound)) notFound();

  const r = round as LineupRound;

  return (
    <>
      <PageHeader
        eyebrow={`Lineup · ${LABELS[r]}`}
        title="Pick your"
        highlight="lineup"
        subtitle="One GK, one defender, one midfielder, one forward. Pool is teams still alive in this round."
      />
      <ComingSoon label={`Lineup builder · Day 12–13`} shipBy="2026-06-01" />
    </>
  );
}
