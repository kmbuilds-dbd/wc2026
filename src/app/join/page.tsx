import { redirect } from "next/navigation";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getUserEmail } from "@/lib/auth";
import { getAccessStatus, approveAccess } from "@/lib/access";

export default async function JoinPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;
  const email = await getUserEmail();

  // Already approved — send them in.
  if (email) {
    const status = await getAccessStatus(email);
    if (status === "approved") redirect("/");
  }

  // No code — show the "you need the link" screen.
  if (!code) {
    return <Shell email={email} message="You need the invite link to join this group." />;
  }

  // Verify code.
  const { env } = await getCloudflareContext({ async: true });
  const inviteCode = (env as unknown as { INVITE_CODE?: string }).INVITE_CODE;
  if (!inviteCode || code !== inviteCode) {
    return <Shell email={email} message="That invite link isn't valid." />;
  }

  // No email — CF Access hasn't authenticated yet (shouldn't happen in prod).
  if (!email) {
    return <Shell email={null} message="Authenticate first, then open your invite link." />;
  }

  await approveAccess(email);
  redirect("/");
}

function Shell({ email, message }: { email: string | null; message: string }) {
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

      <div className="border border-border-base rounded-lg p-6 space-y-3">
        {email && (
          <p className="text-sm text-text-muted">
            Signed in as <span className="text-text font-mono text-xs">{email}</span>
          </p>
        )}
        <p className="text-sm text-text-muted">{message}</p>
      </div>
    </div>
  );
}
