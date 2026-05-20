import { PageHeader } from "@/components/page-header";
import { ComingSoon } from "@/components/coming-soon";

export default async function UserPicksPage({
  params,
}: {
  params: Promise<{ email: string }>;
}) {
  const { email } = await params;
  const decoded = decodeURIComponent(email);

  return (
    <>
      <PageHeader
        eyebrow="Locked categories only"
        title={decoded}
        subtitle="Picks are visible to other users only after their category locks. Yours are always visible to you."
      />
      <ComingSoon label="Public roster view · Day 14–15" shipBy="2026-06-03" />
    </>
  );
}
