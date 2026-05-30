# WC2026 Pick'em

Private FIFA World Cup 2026 prediction game for a small invite-only group. Players sign in with an email one-time PIN, make group-stage, wildcard, bracket, tournament, and knockout lineup picks, then follow live scoring on a leaderboard as match data is ingested.

The app is built for a closed pool rather than a public fantasy product: admin-only maintenance tools, static/current football data snapshots, scheduled ingestion jobs, and lightweight Cloudflare storage are preferred over heavy infrastructure.

## What Is Built

- Invite-gated Clerk email-code auth with no password flow.
- Protected app routes for dashboard, picks, matches, leaderboard, teams, stats, odds, and locked public user rosters.
- Admin console for privileged maintenance commands and data refreshes.
- Group, wildcard, bracket, tournament, and knockout-only lineup pick flows.
- Odds-assisted pick filling from cached Kalshi/odds snapshots without auto-saving user picks.
- FotMob-based fixture and match-stat ingestion for the matches page and scoring refresh.
- Qualification stats pages for group tables, goals, and assists.
- Squad tracker backed by KV, static snapshots, and optional Anthropic-assisted admin refresh.
- D1-backed scoring engine with recompute support and scheduled cron refreshes.

## Tech Stack

| Area | Technology |
| --- | --- |
| App framework | Next.js 16 App Router, React 19 |
| Runtime/deploy | Cloudflare Workers through `@opennextjs/cloudflare` |
| Auth | Clerk email-code sign-in/sign-up |
| Database | Cloudflare D1 with Drizzle ORM |
| Cache/state | Cloudflare KV |
| Styling | Tailwind CSS 4 |
| Validation | Zod |
| Match data | FotMob fixture/stat ingestion |
| Odds | Kalshi/odds snapshots cached in D1 |
| Squads | Static snapshot + KV refresh, optional Anthropic web-search refresh |
| Tooling | TypeScript, Wrangler, Drizzle Kit |

## Main Routes

| Route | Purpose |
| --- | --- |
| `/join` and `/join?code=...` | Email PIN sign-in and invite-based onboarding |
| `/` | Player dashboard and pick progress |
| `/picks` | Main pick form for groups, wildcards, bracket, winner, top scorer, and Golden Glove |
| `/picks/lineup/[round]` | Knockout lineup picks after group stage |
| `/matches` | World Cup fixtures and ingested match stats |
| `/leaderboard` | Current standings and pick completion |
| `/teams` | Squad tracker |
| `/stats` | Qualification group tables, goals, and assists |
| `/statsfull` | Hidden full stats/debug view |
| `/odds` | Cached odds markets |
| `/users/[email]` | Public locked picks for a user |
| `/admin` | Admin-only curl/maintenance console |

## Prerequisites

- Node.js 20+
- npm
- Cloudflare account with Wrangler access
- Clerk application configured for email-code auth
- Cloudflare D1 database
- Cloudflare KV namespace

Optional, depending on which admin jobs you plan to run:

- `ODDS_API_KEY` for odds refreshes.
- `API_SPORTS_KEY` for API-Sports seed/utility routes.
- `ANTHROPIC_API_KEY` for admin squad refresh.
- `CRON_SECRET` for scheduled job requests.

## Install

```bash
npm install
```

## Local Setup

Copy the sample env file and fill the secrets you need:

```bash
cp .dev.vars.example .dev.vars
```

The sample file lists the data-provider secrets. Add the Clerk values and app-level variables below as needed for your local run.

Important local/Worker variables:

| Name | Required For |
| --- | --- |
| `CLERK_SECRET_KEY` | Clerk server-side auth |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk client-side auth, configured in `wrangler.jsonc` for deploys |
| `ADMIN_EMAIL` | Admin identity and admin navigation |
| `INVITE_CODE` | Private join link code |
| `CRON_SECRET` | Cron/admin route authentication |
| `ODDS_API_KEY` | Odds refresh |
| `API_SPORTS_KEY` | API-Sports seed helpers |
| `ANTHROPIC_API_KEY` | Squad refresh |

Run the Next.js dev server:

```bash
npm run dev
```

Open `http://localhost:3000`.

For a closer Cloudflare runtime test:

```bash
npm run preview
```

## Database

The schema lives in `src/db/schema.ts`; migrations are in `src/db/migrations`.

```bash
# Generate migrations after schema edits
npm run db:gen

# Apply migrations locally
npm run db:apply:local

# Apply migrations to production D1
npm run db:apply:remote

# Open Drizzle Studio
npm run db:studio
```

If provisioning from scratch:

```bash
npx wrangler d1 create wc2026
npx wrangler kv namespace create wc2026-cache
```

Then copy the generated IDs into `wrangler.jsonc`.

## Cloudflare Setup

`wrangler.jsonc` defines:

- Worker name: `wc2026`
- D1 binding: `DB`
- KV binding: `CACHE`
- Assets binding: `ASSETS`
- Images binding: `IMAGES`
- Self-reference service binding: `WORKER_SELF_REFERENCE`
- Scheduled triggers:
  - `*/30 * * * *` for match ingestion
  - `0 6 * * *` for odds refresh
  - `0 9 * * *` for squad refresh

Set Worker secrets with Wrangler:

```bash
npx wrangler secret put CLERK_SECRET_KEY
npx wrangler secret put CRON_SECRET
npx wrangler secret put ODDS_API_KEY
npx wrangler secret put API_SPORTS_KEY
npx wrangler secret put ANTHROPIC_API_KEY
```

Only set the optional data-provider secrets you actually use.

## Clerk Setup

Create a Clerk app with email-code authentication and no password requirement. Configure the publishable key in `wrangler.jsonc` and the secret key through Wrangler.

The onboarding flow is:

1. Existing registered users can sign in at `/join` with a one-time email PIN.
2. New users must arrive with `/join?code=<INVITE_CODE>`.
3. Approved users are stored in KV under `wc26:approved:<email>` and mirrored into D1 `users`.
4. The configured `ADMIN_EMAIL` gets access to `/admin` and admin-only refresh controls.

## Data And Jobs

| Job | Route | Trigger |
| --- | --- | --- |
| Match ingestion | `/api/cron/ingest-matches` | Scheduled every 30 minutes |
| Odds refresh | `/api/cron/refresh-odds` | Scheduled daily |
| Squad refresh | `/api/admin/refresh-squads` | Admin/manual and scheduled daily |
| Score recompute | `/api/admin/recompute` | Admin/manual |
| Fixture discovery/import | `/api/admin/discover-fixtures`, `/api/admin/import-fixtures` | Admin/manual |
| Qualification stats refresh | `/api/admin/refresh-qualification-stats` | Admin/manual |

Admin routes require the configured admin user. Cron-capable routes can also authenticate with `x-cron-secret: <CRON_SECRET>`.

## Deploy

```bash
npm run deploy
```

The deploy script:

1. Builds the OpenNext Cloudflare bundle.
2. Patches the generated Worker with the scheduled-handler mapping in `scripts/patch-worker-scheduled.mjs`.
3. Deploys with Wrangler.

For a build-only check:

```bash
npm run build
```

For a type check:

```bash
npx tsc --noEmit
```

## Project Map

```text
src/
  app/
    (app)/                  Protected app routes
    api/admin/              Admin-only maintenance APIs
    api/cron/               Scheduled ingestion APIs
    join/                   Email PIN and invite flow
  components/               Shared UI and pick sections
  db/                       Drizzle schema, client, migrations
  lib/
    auth.ts                 Clerk/D1/KV access helpers
    access.ts               Invite approval status
    locks.ts                Pick lock policy
    scoring/                Rules, pure compute, D1 apply layer
    fotmob/                 Fixture and match-stat ingestion
    odds/                   Odds refresh and pick suggestions
    squads/                 Squad tracker refresh/load logic
    qualification-stats.ts  Stats payload handling
```

## Notes For Maintainers

- Use `rg`/`rg --files` to inspect code quickly.
- Keep manual refresh controls admin-only.
- When using Wrangler KV commands against production, pass `--remote`; binding commands default to local state.
- After schema edits, generate and apply a migration before deploying.
- After scoring or lock-rule edits, run `npx tsc --noEmit` and `npm run build`.
