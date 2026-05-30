# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

WC2026 Pick'em — closed-group (≤50 users) FIFA World Cup 2026 predictions app. Tournament kicks off Jun 11, 2026. Ship target: Jun 9. Source of truth for design decisions: `/Users/kunalmorparia/.claude/plans/with-https-raw-githubusercontent-com-mul-hashed-rabbit.md`.

## Commands

```bash
npm run dev               # next dev (no CF runtime — ADMIN_EMAIL fallback for auth)
npm run preview           # opennextjs-cloudflare preview (full CF runtime locally)
npm run build             # next build — verify changes compile
npm run deploy            # opennextjs-cloudflare build && deploy
npm run db:gen            # regenerate SQL migrations from src/db/schema.ts
npm run db:apply:local    # apply migrations to local D1
npm run db:apply:remote   # apply migrations to production D1
npm run cf-typegen        # regen cloudflare-env.d.ts from wrangler.jsonc
```

No test suite yet. Verification = build clean + manual click-through.

## Important: Next.js 16

This repo is on Next 16 (App Router, React 19). It has breaking changes from prior versions you may know:

- `headers()`, `cookies()`, `params`, `searchParams` are **async** — always `await` them
- Route handlers receive `NextRequest`, return `NextResponse` (no change), but config exports like `runtime` and `dynamic` may have moved
- Caching defaults changed; consult `node_modules/next/dist/docs/` before adding `revalidate` or `dynamic` exports
- See `AGENTS.md` for the rule we ship to other LLMs

## Stack

- **Next.js 16** App Router, React 19, TypeScript 5
- **Tailwind CSS 4** (via `@tailwindcss/postcss`, `@theme` block in globals.css)
- **`@opennextjs/cloudflare`** adapter — `next build` → `.open-next/worker.js` → deploys as a CF Worker
- **Cloudflare D1** (SQLite) via Drizzle ORM
- **Cloudflare KV** (`CACHE` binding) — reuses the wc2026_worker tracker's namespace
- **Clerk** — email-code auth with invite approval
- **FotMob** — fixtures, qualification stats, and match event/stat ingestion
- **Kalshi public markets** — odds snapshots for the `/odds` page

## Architecture

### Auth

Clerk handles email-code sign-in/sign-up. `src/lib/auth.ts` reads the Clerk session, lazy-creates a `users` row on first hit, and exposes `requireUser()` / `requireAdmin()`. In `next dev`, fallback is the `ADMIN_EMAIL` env var or `x-dev-user-email` header.

### Pick locks

`src/lib/locks.ts` is the single source of truth. `isLocked('group' | 'wildcard' | 'bracket' | 'tournament' | 'lineup', round?)` — every write path must call this before mutating. Tournament-level locks at `FIRST_KICKOFF_UTC`. Lineup locks at each round's first kickoff.

### Data model

Drizzle schema in `src/db/schema.ts`. Tables: `users`, `teams`, `matches`, `group_picks`, `wildcard_picks`, `bracket_picks`, `tournament_picks`, `lineup_picks`, `scores` (idempotent), `odds_snapshots`. Scores are computed by replaying `matches.raw_events` JSON against picks — re-running produces identical rows.

### Cron jobs

`wrangler.jsonc → triggers.crons` declares three crons:
- `*/30 * * * *` — `/api/cron/ingest-matches` (finished match → events → re-score)
- `0 6 * * *` — `/api/cron/refresh-odds` (daily Kalshi odds pull)
- `0 9 * * *` — metadata/squad refresh

Route handlers are POST endpoints gated by admin auth or `CRON_SECRET`.

### Design tokens

Ported from wc2026_worker's tracker — dark `#080810` bg, gold `#f7c325` accent, Bebas Neue + DM Sans + DM Mono. Defined in `src/app/globals.css` via Tailwind 4 `@theme` block. Status colors (`confirmed`, `preliminary`, `pending`, `danger`) usable as `bg-confirmed/10 text-confirmed border-confirmed/25` etc.

## Working guidelines

### Think before coding

State assumptions. If multiple interpretations of a requirement exist, surface them rather than picking silently. If something is unclear (especially Next 16 API shape), stop and check `node_modules/next/dist/docs/` before guessing.

### Simplicity first

Minimum code. No features beyond what's asked. No abstractions for single-use code. No `try/catch` for impossible scenarios. Re-read your own diffs and ask: "would a senior engineer call this overcomplicated?"

### Surgical changes

Touch only what the task requires. Don't reformat unrelated code. Match existing style. Remove imports your own changes orphaned; leave pre-existing dead code alone.

### Goal-driven verification

Every task → a verifiable goal before writing code:
- "Add validation" → "Define invalid inputs, prove they're rejected"
- "Fix the bug" → "Reproduce it, fix it, confirm reproduction stops triggering"
- "Refactor X" → "Confirm `npm run build` + the affected click-path still works"

Since there's no test suite, verification means `npm run build` is clean + the affected UI path works in `npm run dev` or `npm run preview`.

## Environment variables

| Var | Source | Used by |
|---|---|---|
| `ANTHROPIC_API_KEY` | secret | `lib/squads/refresh.ts` |
| `CLERK_SECRET_KEY` | secret | Clerk server auth |
| `CRON_SECRET` | secret | `api/cron/*` route auth |
| `ADMIN_EMAIL` | `vars` | `lib/auth.ts` (admin gate + dev fallback) |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | `vars` in wrangler.jsonc | Clerk browser auth |
| `NEXTJS_ENV` | `.dev.vars` | dev-only auth fallback |
