"use client";

/**
 * Admin-only per-match button on /matches. POSTs to /api/admin/scrape-and-save
 * with the row's D1 matches.id. The endpoint reads the row's whoscored_match_id,
 * scrapes the WhoScored page, resolves player names, writes back to D1.
 *
 * On success, reloads the page so the row re-renders with the new events.
 */
import { useState } from "react";

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | {
      kind: "result";
      ok: boolean;
      message: string;
      written: boolean;
      unresolvedCount?: number;
    };

export function ScrapeMatchButton({ matchId }: { matchId: number }) {
  const [state, setState] = useState<State>({ kind: "idle" });

  async function onClick() {
    setState({ kind: "loading" });
    try {
      const res = await fetch("/api/admin/scrape-and-save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        report?: {
          status: string;
          written: boolean;
          unresolvedPlayers: Array<unknown>;
          events: Array<unknown>;
        };
      };
      if (!res.ok || !body.ok) {
        setState({
          kind: "result",
          ok: false,
          message: body.error ?? `HTTP ${res.status}`,
          written: false,
        });
        return;
      }
      const r = body.report!;
      setState({
        kind: "result",
        ok: true,
        message: `${r.status} · ${r.events.length} events`,
        written: r.written,
        unresolvedCount: r.unresolvedPlayers.length,
      });
      if (r.written) {
        setTimeout(() => window.location.reload(), 800);
      }
    } catch (e) {
      setState({
        kind: "result",
        ok: false,
        message: e instanceof Error ? e.message : String(e),
        written: false,
      });
    }
  }

  return (
    <div className="flex items-center gap-2 mt-1">
      <button
        type="button"
        onClick={onClick}
        disabled={state.kind === "loading"}
        className="font-mono text-[10px] uppercase tracking-[0.1em] px-2 py-1 rounded-sm border border-accent/30 bg-accent/5 text-accent hover:bg-accent/15 disabled:opacity-50"
      >
        {state.kind === "loading" ? "Scraping…" : "Scrape & save"}
      </button>
      {state.kind === "result" && (
        <span
          className={`font-mono text-[10px] ${
            state.ok ? "text-confirmed" : "text-danger"
          }`}
          title={state.message}
        >
          {state.ok
            ? state.written
              ? `✓ ${state.message} · reloading…`
              : `parsed: ${state.message}${
                  state.unresolvedCount
                    ? ` · ${state.unresolvedCount} unresolved`
                    : ""
                }`
            : `✗ ${state.message.slice(0, 50)}`}
        </span>
      )}
    </div>
  );
}
