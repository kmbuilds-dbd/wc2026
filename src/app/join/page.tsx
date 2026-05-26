import { redirect } from "next/navigation";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

export default async function JoinPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; error?: string }>;
}) {
  const { code, error } = await searchParams;

  // Already have a session — skip the form
  const jar = await cookies();
  if (jar.has("wc_email")) redirect("/");

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
        {code ? (
          <>
            <p className="text-sm text-text-muted">Enter your email to join the group.</p>
            {error === "email" && (
              <p className="text-sm text-danger">Please enter a valid email address.</p>
            )}
            {error === "invalid" && (
              <p className="text-sm text-danger">That invite link isn&apos;t valid.</p>
            )}
            <form method="POST" action="/api/access/join" className="flex flex-col gap-3">
              <input type="hidden" name="code" value={code} />
              <input
                type="email"
                name="email"
                required
                autoFocus
                placeholder="you@example.com"
                className="w-full bg-bg border border-border-base rounded px-3 py-2 text-sm text-text placeholder:text-text-dim focus:outline-none focus:border-accent"
              />
              <button
                type="submit"
                className="w-full bg-accent text-bg font-mono text-[11px] uppercase tracking-[0.15em] py-2 rounded hover:opacity-90 transition-opacity"
              >
                Join
              </button>
            </form>
          </>
        ) : (
          <p className="text-sm text-text-muted">
            You need the invite link to join this group.
          </p>
        )}
      </div>
    </div>
  );
}
