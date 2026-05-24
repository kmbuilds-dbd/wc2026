import { redirect } from "next/navigation";
import { getUserEmail } from "@/lib/auth";
import { getAccessStatus } from "@/lib/access";
import { RequestAccessForm } from "@/components/request-access-form";

export default async function RequestAccessPage() {
  const email = await getUserEmail();
  if (!email) {
    // CF Access is in front — this shouldn't happen in prod.
    return (
      <div className="max-w-md mx-auto mt-24 text-center space-y-4">
        <h1 className="font-display text-4xl tracking-wide">
          WC<span className="text-accent">2026</span> Pick&apos;em
        </h1>
        <p className="text-text-muted text-sm">
          Authenticate via the login link to request access.
        </p>
      </div>
    );
  }

  const status = await getAccessStatus(email);
  if (status === "approved") redirect("/");

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

      <div className="border border-border-base rounded-lg p-6 space-y-4">
        <p className="text-sm text-text-muted">
          Signed in as <span className="text-text font-mono text-xs">{email}</span>
        </p>

        {status === "pending" ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-accent animate-pulse" />
              <span className="font-mono text-xs uppercase tracking-widest text-accent">
                Request pending
              </span>
            </div>
            <p className="text-sm text-text-muted">
              Your access request has been submitted. You&apos;ll receive an email
              once it&apos;s approved.
            </p>
          </div>
        ) : (
          <RequestAccessForm email={email} />
        )}
      </div>
    </div>
  );
}
