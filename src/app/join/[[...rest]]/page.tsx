import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { SignIn } from "@clerk/nextjs";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getAccessStatus, approveAccess } from "@/lib/access";

export const dynamic = "force-dynamic";

const SIGN_IN_APPEARANCE = {
  variables: {
    colorBackground: "#0d0d1a",
    colorInputBackground: "#080810",
    colorText: "#e8e8f0",
    colorTextSecondary: "#888",
    colorPrimary: "#f7c325",
    colorDanger: "#f87171",
    borderRadius: "0.375rem",
  },
  elements: {
    socialButtonsBlockButton: {
      backgroundColor: "#ffffff",
      border: "1px solid #d1d5db",
      color: "#111827",
    },
    socialButtonsBlockButtonText: {
      color: "#111827",
      fontWeight: "500",
    },
  },
};

export default async function JoinPage({
  params,
  searchParams,
}: {
  params: Promise<{ rest?: string[] }>;
  searchParams: Promise<{ code?: string }>;
}) {
  const { rest } = await params;
  const { code } = await searchParams;

  // Sub-paths are Clerk's internal steps (SSO callback, MFA, etc.) — just render.
  if (rest?.length) {
    return (
      <div className="flex justify-center mt-24">
        <SignIn appearance={SIGN_IN_APPEARANCE} />
      </div>
    );
  }

  const { userId } = await auth();

  if (userId) {
    const clerkUser = await currentUser();
    const email = clerkUser?.emailAddresses[0]?.emailAddress?.toLowerCase();

    if (email) {
      const status = await getAccessStatus(email);
      if (status === "approved") redirect("/");

      if (code) {
        const { env } = await getCloudflareContext({ async: true });
        const inviteCode = (env as unknown as { INVITE_CODE?: string }).INVITE_CODE;
        if (inviteCode && code === inviteCode) {
          await approveAccess(email);
          redirect("/");
        }
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
        {code ? (
          <SignIn
            forceRedirectUrl={`/join?code=${encodeURIComponent(code)}`}
            appearance={SIGN_IN_APPEARANCE}
          />
        ) : (
          <div className="border border-border-base rounded-lg p-6 w-full">
            <p className="text-sm text-text-muted">
              You need the invite link to join this group.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
