import { redirect } from "next/navigation";
import { getUserEmail } from "@/lib/auth";
import { getAccessStatus } from "@/lib/access";

export const dynamic = "force-dynamic";

export default async function JoinPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; error?: string }>;
}) {
  const { code, error } = await searchParams;

  if (code) {
    redirect(`/api/access/join?code=${encodeURIComponent(code)}`);
  }

  const email = await getUserEmail();
  if (email) {
    const status = await getAccessStatus(email);
    if (status === "approved") {
      redirect("/api/access/join");
    }
  }

  const message =
    error === "invalid"
      ? "That invite link isn't valid."
      : "You need the invite link to join this group.";

  return (
    <div className="max-w-md mx-auto mt-24 space-y-8">
      <div className="text-center space-y-2">
        <h1 className="font-display text-4xl tracking-wide">
          WC<span className="text-accent">2026</span> Pick&apos;em
        </h1>
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-text-muted">
          Closed-group FIFA World Cup 2026 predictions
        </p>
      </div>

      <div className="border border-border-base rounded-lg p-6">
        {email && (
          <p className="text-sm text-text-muted mb-2">
            Signed in as <span className="text-text font-mono text-xs">{email}</span>
          </p>
        )}
        <p className="text-sm text-text-muted">{message}</p>
      </div>
    </div>
  );
}
