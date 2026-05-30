"use client";

import { useMemo, useState } from "react";

type ParsedCurl = {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
};

type RunResult = {
  ok: boolean;
  status: number;
  statusText: string;
  durationMs: number;
  body: string;
};

type ProgressEntry = {
  id: number;
  elapsedMs: number;
  message: string;
};

const EXAMPLE_CURL = `curl -X POST /api/admin/recompute`;

function tokenize(input: string) {
  const tokens: string[] = [];
  let current = "";
  let quote: "'" | '"' | null = null;
  let escaped = false;

  const normalized = input.replace(/\\\r?\n/g, " ");

  for (const char of normalized) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }

    if (char === "\\" && quote !== "'") {
      escaped = true;
      continue;
    }

    if ((char === "'" || char === '"') && !quote) {
      quote = char;
      continue;
    }

    if (char === quote) {
      quote = null;
      continue;
    }

    if (!quote && /\s/.test(char)) {
      if (current) {
        tokens.push(current);
        current = "";
      }
      continue;
    }

    current += char;
  }

  if (quote) throw new Error("Unclosed quote in curl command.");
  if (escaped) current += "\\";
  if (current) tokens.push(current);
  return tokens;
}

function readValue(tokens: string[], index: number, flag: string) {
  const value = tokens[index + 1];
  if (!value) throw new Error(`${flag} needs a value.`);
  return value;
}

function parseCurl(input: string): ParsedCurl {
  const tokens = tokenize(input.trim());
  if (tokens[0] !== "curl") throw new Error("Command must start with curl.");

  let method = "GET";
  let url = "";
  const headers: Record<string, string> = {};
  const bodyParts: string[] = [];

  for (let i = 1; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (!token) continue;

    if (token === "-X" || token === "--request") {
      method = readValue(tokens, i, token).toUpperCase();
      i += 1;
      continue;
    }

    if (token.startsWith("-X") && token.length > 2) {
      method = token.slice(2).toUpperCase();
      continue;
    }

    if (token === "-H" || token === "--header") {
      const header = readValue(tokens, i, token);
      const separator = header.indexOf(":");
      if (separator === -1) throw new Error(`Invalid header: ${header}`);
      const name = header.slice(0, separator).trim();
      const value = header.slice(separator + 1).trim();
      if (!name) throw new Error(`Invalid header: ${header}`);
      headers[name] = value;
      i += 1;
      continue;
    }

    if (token === "-d" || token === "--data" || token === "--data-raw" || token === "--data-binary") {
      bodyParts.push(readValue(tokens, i, token));
      if (method === "GET") method = "POST";
      i += 1;
      continue;
    }

    if (token === "-I" || token === "--head") {
      method = "HEAD";
      continue;
    }

    if (token === "-s" || token === "--silent" || token === "-i" || token === "--include") {
      continue;
    }

    if (token.startsWith("-")) {
      throw new Error(`Unsupported curl flag: ${token}`);
    }

    if (url) throw new Error(`Unexpected extra argument: ${token}`);
    url = token;
  }

  if (!url) throw new Error("Curl command needs a URL or path.");

  const parsed = new URL(url, window.location.origin);
  if (parsed.origin !== window.location.origin) {
    throw new Error("Only same-origin app URLs can be run from this console.");
  }

  return {
    method,
    url: parsed.pathname + parsed.search,
    headers,
    ...(bodyParts.length ? { body: bodyParts.join("&") } : {}),
  };
}

function formatBody(contentType: string | null, text: string) {
  if (!text) return "";
  if (!contentType?.includes("application/json")) return text;

  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

export function CurlRunner() {
  const [command, setCommand] = useState(EXAMPLE_CURL);
  const [result, setResult] = useState<RunResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<ProgressEntry[]>([]);

  const preview = useMemo(() => {
    try {
      return parseCurl(command);
    } catch {
      return null;
    }
  }, [command]);

  async function runCommand() {
    const started = performance.now();
    setBusy(true);
    setError(null);
    setResult(null);
    setProgress([]);

    try {
      const parsed = parseCurl(command);
      let nextProgressId = 1;
      let waitingTimer: number | null = null;
      const addProgress = (message: string) => {
        setProgress((entries) => [
          ...entries,
          {
            id: nextProgressId++,
            elapsedMs: Math.round(performance.now() - started),
            message,
          },
        ]);
      };

      addProgress(`Parsed ${parsed.method} ${parsed.url}`);
      addProgress("Request started");
      waitingTimer = window.setInterval(() => {
        addProgress("Still waiting for response");
      }, 10000);

      let response: Response;
      try {
        response = await fetch(parsed.url, {
          method: parsed.method,
          headers: parsed.headers,
          credentials: "same-origin",
          ...(parsed.body ? { body: parsed.body } : {}),
        });
      } finally {
        if (waitingTimer !== null) window.clearInterval(waitingTimer);
      }
      addProgress(`Response received: ${response.status} ${response.statusText || ""}`.trim());
      const text = await response.text();
      addProgress(`Read ${text.length.toLocaleString()} response bytes`);
      const durationMs = Math.round(performance.now() - started);
      const formattedBody = formatBody(response.headers.get("content-type"), text);
      addProgress("Response body formatted");

      setResult({
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        durationMs,
        body: formattedBody,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setProgress((entries) => [
        ...entries,
        {
          id: entries.length + 1,
          elapsedMs: Math.round(performance.now() - started),
          message: `Error: ${message}`,
        },
      ]);
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-4">
        <label className="block space-y-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-text-muted">
            Curl
          </span>
          <textarea
            className="min-h-52 w-full resize-y rounded border border-border-base bg-surface px-4 py-3 font-mono text-xs leading-relaxed text-text outline-none focus:border-accent"
            onChange={(event) => setCommand(event.target.value)}
            spellCheck={false}
            value={command}
          />
        </label>

        <div className="flex flex-wrap gap-3">
          <button
            className="rounded-sm border border-accent/40 bg-accent px-4 py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-bg transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={busy}
            onClick={runCommand}
            type="button"
          >
            {busy ? "Running" : "Run"}
          </button>
          <button
            className="rounded-sm border border-border-base px-4 py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-text-muted transition hover:border-accent/40 hover:text-accent disabled:cursor-not-allowed disabled:opacity-60"
            disabled={busy}
            onClick={() => {
              setCommand(EXAMPLE_CURL);
              setError(null);
              setResult(null);
              setProgress([]);
            }}
            type="button"
          >
            Reset
          </button>
        </div>

        {error ? (
          <div className="rounded border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
            {error}
          </div>
        ) : null}

        {progress.length > 0 ? (
          <div className="rounded border border-border-base bg-surface overflow-hidden">
            <div className="border-b border-border-base px-4 py-3 font-mono text-[10px] uppercase tracking-[0.14em] text-text-muted">
              Progress
            </div>
            <ol className="max-h-56 overflow-auto p-4 space-y-2">
              {progress.map((entry) => (
                <li key={entry.id} className="grid grid-cols-[64px_minmax(0,1fr)] gap-3 text-xs">
                  <span className="font-mono text-text-dim">
                    {(entry.elapsedMs / 1000).toFixed(1)}s
                  </span>
                  <span className="text-text-muted">{entry.message}</span>
                </li>
              ))}
            </ol>
          </div>
        ) : null}

        {result ? (
          <div className="rounded border border-border-base bg-surface overflow-hidden">
            <div className="border-b border-border-base px-4 py-3 flex flex-wrap items-center justify-between gap-3">
              <div className={result.ok ? "text-confirmed" : "text-danger"}>
                {result.status} {result.statusText || (result.ok ? "OK" : "Error")}
              </div>
              <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-muted">
                {result.durationMs}ms
              </div>
            </div>
            <pre className="max-h-[520px] overflow-auto whitespace-pre-wrap p-4 font-mono text-xs leading-relaxed text-text-muted">
              {result.body || "(empty response)"}
            </pre>
          </div>
        ) : null}
      </div>

      <aside className="rounded border border-border-base bg-surface p-4 space-y-4">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-text-muted mb-2">
            Parsed Request
          </div>
          {preview ? (
            <dl className="space-y-3 text-xs">
              <div>
                <dt className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-dim">
                  Method
                </dt>
                <dd className="text-text">{preview.method}</dd>
              </div>
              <div>
                <dt className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-dim">
                  URL
                </dt>
                <dd className="break-all text-text">{preview.url}</dd>
              </div>
              <div>
                <dt className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-dim">
                  Headers
                </dt>
                <dd className="whitespace-pre-wrap break-all text-text-muted">
                  {Object.keys(preview.headers).length
                    ? JSON.stringify(preview.headers, null, 2)
                    : "{}"}
                </dd>
              </div>
              <div>
                <dt className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-dim">
                  Body
                </dt>
                <dd className="whitespace-pre-wrap break-all text-text-muted">
                  {preview.body ?? "(none)"}
                </dd>
              </div>
            </dl>
          ) : (
            <p className="text-xs text-text-muted">Waiting for a valid curl command.</p>
          )}
        </div>
      </aside>
    </section>
  );
}
