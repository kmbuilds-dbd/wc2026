"use client";

/**
 * Admin-only button on /teams that POSTs to /api/admin/refresh-squads.
 * The endpoint runs the squad update flow and caches results in KV.
 * After success, force a hard reload so the page re-renders from KV.
 */
import { useState } from "react";

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success"; teams: number; changed: number }
  | { kind: "error"; message: string };

export function RefreshSquadsButton() {
  const [state, setState] = useState<State>({ kind: "idle" });

  async function onClick() {
    setState({ kind: "loading" });
    try {
      const res = await fetch("/api/admin/refresh-squads", { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        teams?: number;
        changed?: number;
        error?: string;
      };
      if (!res.ok || !body.ok) {
        setState({
          kind: "error",
          message: body.error ?? `HTTP ${res.status}`,
        });
        return;
      }
      setState({ kind: "success", teams: body.teams ?? 0, changed: body.changed ?? 0 });
      // Hard reload so the server reads the freshly-cached KV value.
      setTimeout(() => window.location.reload(), 800);
    } catch (e) {
      setState({
        kind: "error",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return (
    <div className="flex items-center gap-3">
      {state.kind === "success" && (
        <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-confirmed">
          ✓ {state.changed} changed · {state.teams} teams · reloading…
        </span>
      )}
      {state.kind === "error" && (
        <span className="font-mono text-[10px] text-danger" title={state.message}>
          ✗ {state.message.slice(0, 40)}
        </span>
      )}
      <button
        type="button"
        onClick={onClick}
        disabled={state.kind === "loading"}
        className="font-mono text-[10px] uppercase tracking-[0.12em] px-3 py-1.5 rounded-sm border border-accent/30 bg-accent/5 text-accent hover:bg-accent/15 disabled:opacity-50"
      >
        {state.kind === "loading" ? "Refreshing…" : "Refresh squads"}
      </button>
    </div>
  );
}
