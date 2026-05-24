"use client";

import { useState } from "react";

export function RequestAccessForm({ email }: { email: string }) {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setState("loading");
    try {
      const res = await fetch("/api/access/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) throw new Error(await res.text());
      setState("done");
    } catch {
      setState("error");
    }
  }

  if (state === "done") {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full bg-accent animate-pulse" />
          <span className="font-mono text-xs uppercase tracking-widest text-accent">
            Request submitted
          </span>
        </div>
        <p className="text-sm text-text-muted">
          You&apos;ll receive an email once your access is approved.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-sm text-text-muted">
        This is a closed group. Request access and you&apos;ll be notified when
        you&apos;re approved.
      </p>
      {state === "error" && (
        <p className="text-sm text-danger">Something went wrong. Try again.</p>
      )}
      <button
        type="submit"
        disabled={state === "loading"}
        className="w-full py-2 px-4 bg-accent text-bg font-mono text-xs uppercase tracking-widest rounded hover:bg-accent/90 disabled:opacity-50 transition-colors"
      >
        {state === "loading" ? "Requesting…" : "Request Access"}
      </button>
    </form>
  );
}
