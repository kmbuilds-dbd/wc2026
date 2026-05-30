import { getCloudflareContext } from "@opennextjs/cloudflare";
import { z } from "zod";
import { trackerTeams, type TrackerTeam } from "@/data/tracker-snapshot";

const APP_TEAMS_KEY = "squads:latest";
const APP_FETCHED_AT_KEY = "squads:latest:fetchedAt";
const LEGACY_TEAMS_KEY = "teams";
const LEGACY_META_KEY = "meta";

const SquadSchema = z.object({
  GK: z.array(z.string()).default([]),
  DEF: z.array(z.string()).default([]),
  MID: z.array(z.string()).default([]),
  FWD: z.array(z.string()).default([]),
});

const OmissionSchema = z.object({
  n: z.string(),
  r: z.string(),
});

const SquadStatusSchema = z.enum(["confirmed", "preliminary", "pending"]);

const SquadUpdateSchema = z.object({
  name: z.string(),
  status: SquadStatusSchema.optional(),
  statusLabel: z.string().optional(),
  squad: SquadSchema.optional(),
  omissions: z.array(OmissionSchema).optional(),
  note: z.string().nullable().optional(),
  coach: z.string().optional(),
});

const UpdatesResponseSchema = z.object({
  updates: z.array(SquadUpdateSchema).default([]),
  checkedAt: z.string().optional(),
});

type SquadUpdate = z.infer<typeof SquadUpdateSchema>;

type SquadMeta = {
  lastChecked?: string;
  lastUpdated?: string;
  lastError?: string;
  version?: number;
  teamsConfirmed?: number;
  teamsPreliminary?: number;
  teamsPending?: number;
  lastChanges?: string[];
};

export type LoadSquadsResult = {
  teams: TrackerTeam[];
  fetchedAt: number | null;
  source: "app-kv" | "legacy-kv" | "snapshot";
  meta: SquadMeta;
};

export type RefreshSquadsResult = {
  ok: true;
  checkedAt: string;
  changed: number;
  teams: number;
  teamsConfirmed: number;
  teamsPreliminary: number;
  teamsPending: number;
  source: "manual" | "anthropic";
  updates: string[];
};

type EnvWithSquadBindings = CloudflareEnv & {
  ANTHROPIC_API_KEY?: string;
};

function kvParse(raw: string | null, fallback: unknown): unknown {
  if (raw === null || raw === undefined) return fallback;
  let current: unknown = raw;
  for (let i = 0; i < 5; i += 1) {
    if (typeof current !== "string") return current;
    try {
      current = JSON.parse(current) as unknown;
    } catch {
      return current;
    }
  }
  return current;
}

function parseTeams(raw: string | null): TrackerTeam[] | null {
  const parsed = kvParse(raw, null);
  return Array.isArray(parsed) && parsed.length > 0 ? (parsed as TrackerTeam[]) : null;
}

function parseMeta(raw: string | null): SquadMeta {
  const parsed = kvParse(raw, {});
  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? (parsed as SquadMeta)
    : {};
}

function todayIso() {
  return new Date().toISOString().split("T")[0] ?? "";
}

function counts(teams: TrackerTeam[]) {
  return {
    teamsConfirmed: teams.filter((t) => t.s === "confirmed").length,
    teamsPreliminary: teams.filter((t) => t.s === "preliminary").length,
    teamsPending: teams.filter((t) => t.s === "pending").length,
  };
}

async function putTeams(teams: TrackerTeam[]) {
  const { env } = await getCloudflareContext({ async: true });
  const body = JSON.stringify(teams);
  const fetchedAt = Math.floor(Date.now() / 1000);

  await Promise.all([
    env.CACHE.put(APP_TEAMS_KEY, body),
    env.CACHE.put(APP_FETCHED_AT_KEY, String(fetchedAt)),
    env.CACHE.put(LEGACY_TEAMS_KEY, body),
  ]);

  return fetchedAt;
}

async function putMeta(meta: SquadMeta) {
  const { env } = await getCloudflareContext({ async: true });
  await env.CACHE.put(LEGACY_META_KEY, JSON.stringify(meta));
}

export async function loadSquads(): Promise<LoadSquadsResult> {
  const { env } = await getCloudflareContext({ async: true });
  const [appRaw, legacyRaw, fetchedAtRaw, metaRaw] = await Promise.all([
    env.CACHE.get(APP_TEAMS_KEY),
    env.CACHE.get(LEGACY_TEAMS_KEY),
    env.CACHE.get(APP_FETCHED_AT_KEY),
    env.CACHE.get(LEGACY_META_KEY),
  ]);

  const meta = parseMeta(metaRaw);
  const appTeams = parseTeams(appRaw);
  if (appTeams) {
    return {
      teams: appTeams,
      fetchedAt: fetchedAtRaw ? Number(fetchedAtRaw) : null,
      source: "app-kv",
      meta,
    };
  }

  const legacyTeams = parseTeams(legacyRaw);
  if (legacyTeams) {
    return {
      teams: legacyTeams,
      fetchedAt: null,
      source: "legacy-kv",
      meta,
    };
  }

  return { teams: trackerTeams, fetchedAt: null, source: "snapshot", meta };
}

function buildPrompt(teams: TrackerTeam[], meta: SquadMeta) {
  const stillPending = teams
    .filter((t) => t.s === "pending" || t.s === "preliminary")
    .map((t) => t.n);

  if (!stillPending.length) return null;

  const today = todayIso();
  const sinceDate = meta.lastUpdated || "2026-05-19";

  return [
    `Today is ${today}.`,
    "",
    `Search the web for FIFA World Cup 2026 squad announcements for these teams: ${stillPending.join(", ")}`,
    "",
    `For each team, search "[team name] FIFA World Cup 2026 final squad" to check if they have announced their official final 26-man squad since ${sinceDate}.`,
    "",
    "Only include teams with a CONFIRMED FINAL squad, not preliminary squads.",
    "",
    "You MUST respond with ONLY this JSON structure and nothing else, no intro, no explanation, no markdown:",
    `{"updates":[{"name":"Team Name","status":"confirmed","statusLabel":"Confirmed · ${today}","squad":{"GK":["Player (Club)"],"DEF":["Player (Club)"],"MID":["Player (Club)"],"FWD":["Player (Club)"]},"omissions":[{"n":"Name","r":"Reason"}]}],"checkedAt":"${today}"}`,
    "",
    `If no teams have confirmed: {"updates":[],"checkedAt":"${today}"}`,
  ].join("\n");
}

export function extractJsonText(raw: string) {
  const cleaned = raw
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  const start = cleaned.indexOf("{");
  if (start < 0) {
    throw new Error(`Squad refresh returned no JSON object. Response began: ${cleaned.slice(0, 120)}`);
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < cleaned.length; i += 1) {
    const char = cleaned[i];

    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return cleaned.slice(start, i + 1);
    }
  }

  throw new Error(`Squad refresh returned incomplete JSON. Response began: ${cleaned.slice(0, 120)}`);
}

async function callAnthropicForUpdates(prompt: string) {
  const { env } = await getCloudflareContext({ async: true });
  const key = (env as EnvWithSquadBindings).ANTHROPIC_API_KEY;
  if (!key) {
    throw new Error("ANTHROPIC_API_KEY is not configured.");
  }

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "anthropic-beta": "web-search-2025-03-05",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 8192,
      tools: [{ type: "web_search_20250305", name: "web_search" }],
      system: [
        "You are a football data assistant. Use web_search to look up current FIFA World Cup 2026 squad announcements.",
        "Search for each pending team to find their official final 26-man squad.",
        "After searching, return ONLY a valid JSON object; no prose, no markdown fences, no explanation.",
        'JSON format: { "updates": [...], "checkedAt": "YYYY-MM-DD" }',
      ].join(" "),
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Anthropic API error: ${resp.status} - ${err}`);
  }

  const data = (await resp.json()) as {
    stop_reason?: string;
    content?: Array<{ type: string; text?: string }>;
  };
  const textBlocks = data.content?.filter((b) => b.type === "text" && b.text) ?? [];
  const text = textBlocks.at(-1)?.text;
  if (!text) {
    throw new Error(
      `No text in Anthropic response. stop_reason=${data.stop_reason ?? "unknown"}`,
    );
  }

  return UpdatesResponseSchema.parse(JSON.parse(extractJsonText(text)));
}

function applyUpdatesToTeams(teams: TrackerTeam[], updates: SquadUpdate[]) {
  let changed = 0;
  const changedNames: string[] = [];

  const updatedTeams = teams.map((team) => {
    const update = updates.find(
      (u) => u.name.toLowerCase().trim() === team.n.toLowerCase().trim(),
    );
    if (!update) return team;

    changed += 1;
    changedNames.push(team.n);
    return {
      ...team,
      ...(update.status ? { s: update.status } : {}),
      ...(update.statusLabel ? { sl: update.statusLabel } : {}),
      ...(update.squad ? { sq: update.squad } : {}),
      ...(update.omissions ? { om: update.omissions } : {}),
      ...(update.note !== undefined ? { note: update.note } : {}),
      ...(update.coach ? { c: update.coach } : {}),
    };
  });

  return { teams: updatedTeams, changed, changedNames };
}

export async function refreshSquads(input?: {
  updates?: unknown;
}): Promise<RefreshSquadsResult> {
  const loaded = await loadSquads();
  const today = todayIso();

  let parsed = input?.updates
    ? UpdatesResponseSchema.parse({ updates: input.updates, checkedAt: today })
    : null;
  let source: "manual" | "anthropic" = "manual";

  if (!parsed) {
    const prompt = buildPrompt(loaded.teams, loaded.meta);
    if (!prompt) {
      const c = counts(loaded.teams);
      await putMeta({ ...loaded.meta, lastChecked: today, ...c });
      return {
        ok: true,
        checkedAt: today,
        changed: 0,
        teams: loaded.teams.length,
        ...c,
        source: "anthropic",
        updates: [],
      };
    }

    try {
      parsed = await callAnthropicForUpdates(prompt);
      source = "anthropic";
    } catch (e) {
      await putMeta({
        ...loaded.meta,
        lastChecked: today,
        lastError: e instanceof Error ? e.message : String(e),
      });
      throw e;
    }
  }

  const checkedAt = parsed.checkedAt ?? today;
  const applied = applyUpdatesToTeams(loaded.teams, parsed.updates);
  const c = counts(applied.teams);

  if (applied.changed > 0) {
    await putTeams(applied.teams);
    await putMeta({
      ...loaded.meta,
      lastChecked: checkedAt,
      lastUpdated: today,
      lastError: undefined,
      version: (loaded.meta.version || 0) + 1,
      ...c,
      lastChanges: applied.changedNames,
    });
  } else {
    await putMeta({
      ...loaded.meta,
      lastChecked: checkedAt,
      lastError: undefined,
      ...c,
    });
  }

  return {
    ok: true,
    checkedAt,
    changed: applied.changed,
    teams: applied.teams.length,
    ...c,
    source,
    updates: applied.changedNames,
  };
}
