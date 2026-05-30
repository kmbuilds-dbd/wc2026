import { requireAdmin } from "@/lib/auth";
import { CurlRunner } from "./curl-runner";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const admin = await requireAdmin();

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <header className="pb-7 border-b border-border-base flex items-end justify-between flex-wrap gap-5">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent mb-2">
            Admin
          </div>
          <h1 className="font-display text-[clamp(40px,6vw,80px)] leading-[0.9]">
            Command Console
          </h1>
          <p className="text-xs text-text-muted mt-3 leading-relaxed max-w-prose">
            Signed in as {admin.email}
          </p>
        </div>
      </header>

      <CurlRunner />
    </div>
  );
}
