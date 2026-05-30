import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getAccessStatus, approveAccess } from "@/lib/access";
import { EmailPinAuth } from "../email-pin-auth";

export const dynamic = "force-dynamic";

export default async function JoinPage({
  params,
  searchParams,
}: {
  params: Promise<{ rest?: string[] }>;
  searchParams: Promise<{ code?: string }>;
}) {
  const { rest } = await params;
  const { code } = await searchParams;

  if (rest?.length) {
    redirect(code ? `/join?code=${encodeURIComponent(code)}` : "/join");
  }

  const { env } = await getCloudflareContext({ async: true });
  const inviteCode = (env as unknown as { INVITE_CODE?: string }).INVITE_CODE;
  const inviteValid = Boolean(inviteCode && code === inviteCode);
  const { userId } = await auth();

  if (userId) {
    const clerkUser = await currentUser();
    const email = clerkUser?.emailAddresses[0]?.emailAddress?.toLowerCase();

    if (email) {
      const status = await getAccessStatus(email);
      if (status === "approved") redirect("/");

      if (inviteValid) {
        await approveAccess(email);
        redirect("/");
      }
    }
  }

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

      <div className="flex flex-col items-center">
        <EmailPinAuth inviteCode={inviteValid ? code : undefined} invitePresent={Boolean(code)} />
      </div>
    </div>
  );
}
