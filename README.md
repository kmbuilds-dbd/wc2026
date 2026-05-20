# WC2026 Pick'em

Closed-group (≤50 users) FIFA World Cup 2026 predictions web app. Cloudflare-native: Next.js 16 App Router on Workers via `@opennextjs/cloudflare`, D1 (SQLite) for app data, CF Access for auth, daily-refreshed odds, and per-match score ingestion.

Plan lives at `/Users/kunalmorparia/.claude/plans/with-https-raw-githubusercontent-com-mul-hashed-rabbit.md`. Architecture decisions are in [CLAUDE.md](CLAUDE.md).

## Local dev

```bash
npm install
npm run dev                # next dev on http://localhost:3000 (no CF runtime; uses ADMIN_EMAIL fallback for auth)
npm run preview            # full Cloudflare runtime locally (opennextjs-cloudflare preview)
```

In `next dev` mode, set `ADMIN_EMAIL` in `.dev.vars` to your email and the auth helper will treat every request as authenticated as that user. Or pass `x-dev-user-email: someone@example.com` to test other users.

## Database (D1)

```bash
# One-time: create the production D1 database, paste the printed id into wrangler.jsonc
wrangler d1 create wc2026

# Generate SQL migrations from src/db/schema.ts
npm run db:gen

# Apply migrations
npm run db:apply:local     # local dev D1 (under .wrangler/state/)
npm run db:apply:remote    # production D1

# Browse the schema
npm run db:studio
```

After editing `src/db/schema.ts`, always run `npm run db:gen` to emit a new migration file under `src/db/migrations/`, then apply with `db:apply:remote`.

## Deploy

### 0) Prereqs you need to gather before first deploy

| Prereq | What | Where |
|---|---|---|
| Cloudflare account login | Authenticate wrangler | `wrangler login` |
| Cloudflare account ID | (auto-detected after login) | `wrangler whoami` |
| **api-sports.io key** | `x-apisports-key` for match data | https://dashboard.api-football.com → free tier |
| **The Odds API key** | For the `/odds` page | https://the-odds-api.com → free tier |
| **CRON_SECRET** | Any 32+ char random string | `openssl rand -hex 32` |
| Allowlist of ~50 emails | Group members | Paste into CF Access policy step |

### 1) Provision Cloudflare resources

```bash
# Create D1 (paste the id into wrangler.jsonc → d1_databases[0].database_id)
wrangler d1 create wc2026

# (Optional) Create a fresh KV namespace instead of reusing wc2026_worker's:
#   wrangler kv namespace create wc2026-cache
# then paste the id into wrangler.jsonc → kv_namespaces[0].id

# Apply schema to remote D1
npm run db:apply:remote
```

### 2) Set secrets

```bash
wrangler secret put API_SPORTS_KEY     # paste your api-sports.io key
wrangler secret put ODDS_API_KEY       # paste your The Odds API key
wrangler secret put CRON_SECRET        # paste output of: openssl rand -hex 32
```

### 3) Deploy the worker

```bash
npm run deploy                          # opennextjs-cloudflare build && deploy
```

First deploy outputs the worker URL — `https://wc2026.<your-subdomain>.workers.dev`. Note this for the next step.

### 4) Put Cloudflare Access in front (auth)

In the Cloudflare Zero Trust dashboard:

1. **Access → Applications → Add application → Self-hosted**
2. **Domain:** `wc2026.<your-subdomain>.workers.dev`
3. **Identity provider:** One-Time PIN (built-in, free)
4. **Policies → Add a policy:**
   - Action: **Allow**
   - Include: **Emails** — paste the 50 group emails (or use a comma-separated list / external list)
5. **Save**
6. (Optional) Session duration: **30 days**

The worker is now gated. Every authenticated request includes `cf-access-authenticated-user-email`, which the app reads from `src/lib/auth.ts`.

### 5) Replace the old wc2026-squads worker with a redirect

Edit `wc2026_worker/worker.js` (the sibling project) to a 4-line redirect, or deploy a new tiny worker named `wc2026-squads` whose only behavior is `return Response.redirect("https://wc2026.<sub>.workers.dev/teams", 301)`.

## Architecture cheat-sheet

```
src/
├ app/
│  ├ layout.tsx                Fonts, top nav, theme
│  ├ page.tsx                  Dashboard
│  ├ picks/                    Tournament-level pick UI
│  ├ picks/lineup/[round]/     Per-round lineup builder
│  ├ leaderboard/              Standings
│  ├ users/[email]/            Public roster view
│  ├ teams/                    Squad tracker (migrated from wc2026_worker)
│  ├ odds/                     Three odds markets
│  └ api/
│     ├ picks/                 Pick upsert/list
│     ├ admin/recompute/       Force re-score (admin email only)
│     └ cron/
│        ├ ingest-matches/     Pull finished fixtures, re-score
│        └ refresh-odds/       Daily odds pull
├ db/
│  ├ schema.ts                 Drizzle ORM schema
│  ├ client.ts                 D1 client getter
│  └ migrations/               Auto-generated SQL
└ lib/
   ├ auth.ts                   CF Access header parsing, lazy user creation
   ├ locks.ts                  Pick-lock policy (single source of truth)
   ├ scoring/                  rules.ts + compute.ts + apply.ts
   ├ api-sports/               Thin api-sports.io client
   └ odds/                     Thin The Odds API client
```

## Status (Day 1–2, 2026-05-19)

| Block | State |
|---|---|
| Day 1–2 Scaffold + adapter + theme + auth + stubs | ✅ done |
| Day 3 Seed teams + matches | _next_ |
| Day 4–5 Port squad tracker | pending |
| Day 6–8 Pick UI | pending |
| Day 9–11 Scoring engine + ingestion | pending |
| Day 12–13 Lineup builder | pending |
| Day 14–15 Public roster + polish | pending |
| Day 16–17 Odds page | pending |
| Day 18–19 E2E test | pending |
| **Ship deadline: Jun 9** | |
