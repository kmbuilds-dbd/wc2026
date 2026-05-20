# progress.md — pick-up state for WC2026 pick'em

**Live URL:** https://wc2026.followbuilders.workers.dev (CF Access NOT yet in front — currently open to the public)
**Repo:** https://github.com/kmbuilds-dbd/wc2026 (private)
**Latest version deployed:** `5b34f6ab-2cee-4473-ad42-3f58f4e2e88f` (commit `6f789b2`)
**Today:** 2026-05-19 · **Ship deadline:** 2026-06-09 (2 days before WC kickoff on 2026-06-11)

Source-of-truth artifacts (read these first, do not re-derive):
- Implementation plan: `/Users/kunalmorparia/.claude/plans/with-https-raw-githubusercontent-com-mul-hashed-rabbit.md`
- Project orientation: [CLAUDE.md](CLAUDE.md)
- Deploy + ops runbook: [README.md](README.md)
- Latest commits: `git log --oneline -10`

## Current sprint state

| Block | State |
|---|---|
| Day 1–2 Scaffold + adapter + theme + auth + stubs | ✅ commit `a3f1c5e` |
| Day 1–2.5 D1 binding + migrations applied to remote | ✅ commit `655ed87` |
| Day 3 api-sports/odds clients, seed pipeline, D1-backed locks | ✅ commit `05d7f7c` (api-sports parts are now **stranded** — see "Data provider pivot" below) |
| Day 3.1 x-cron-secret bypass on admin endpoints | ✅ commit `6f789b2` |
| **Day 3.2 Data provider rewrite** (bzzoiro) | 🛑 **NOT STARTED** — paused mid-task |
| Day 4–5 Squad tracker port to `/teams` | ⏸ unblocked (uses bundled snapshot, no API needed) |
| Day 6–8 Pick UI | ⏸ blocked on data seed for real team list |
| Day 9–11 Scoring engine + ingest cron | ⏸ blocked on data provider decision |
| Day 12–13 Lineup builder | ⏸ blocked on data seed |
| Day 14–15 Public roster + polish | ⏸ |
| Day 16–17 Odds page | ⏸ |
| Day 18–19 E2E | ⏸ |

## Data provider pivot — context for picking up

The plan committed to api-sports.io free tier. **Free tier is gated to seasons 2022–2024** → can't fetch WC 2026. Confirmed by curl error:
```json
{ "plan": "Free plans do not have access to this season, try from 2022 to 2024." }
```

User went through several alternatives and **landed on bzzoiro** (https://sports.bzzoiro.com), but the rewrite was paused before any bzzoiro code was written.

### Decision matrix that produced the bzzoiro choice

| Provider | WC 2026? | Per-player events? | Cost / mo | Rate | Notes |
|---|---|---|---|---|---|
| api-sports Free | ❌ seasons 2022–24 only | ✅ on paid | $0 | 100/d | Currently in code; **stranded** for WC2026 |
| api-sports Pro | ✅ | ✅ | $19 | 7,500/d | "Just pay" option, no rewrite |
| balldontlie GOAT | ✅ | ✅ | $39.99 | 600/min | 2× api-sports; rewrite + 48h trial |
| TheSportsDB free | ✅ fixtures only | ❌ no top scorers endpoint | $0 | 30/min | Tight per-endpoint sub-limits |
| TheSportsDB $9 | ✅ | partial | $9 | 100/min | No top scorers endpoint, compute ourselves |
| Soccerway scrape | ✅ (server-rendered) | ✅ | $0 | ToS-risky | Investigated, viable but brittle |
| **bzzoiro Free** | **✅** (claimed) | ✅ via `/events/{id}/incidents/` | **$0** | **no cap** | User-chosen, REST API, requires sign-up token |

### What the next session needs from the user

1. **Sign up at https://sports.bzzoiro.com/register/** — free, no card
2. **Set the token as a Cloudflare secret:**
   ```bash
   wrangler secret put BZZOIRO_TOKEN
   ```
3. **(Optional) Verify WC 2026 IDs** — bzzoiro uses arbitrary internal IDs. The seed must discover them by name. A one-time curl helps:
   ```bash
   curl -H "Authorization: Token <TOKEN>" "https://sports.bzzoiro.com/api/leagues/?search=World%20Cup"
   curl -H "Authorization: Token <TOKEN>" "https://sports.bzzoiro.com/api/seasons/?league=<LEAGUE_ID>"
   ```

### What the next session needs to BUILD

Net-new files (none exist yet):
- `src/lib/bzzoiro/types.ts` — response shapes for `/events`, `/events/{id}/incidents/`, `/leagues`, `/seasons`, `/teams`, `/standings`, `/players`, `/predicted-lineup/{event_id}/`
- `src/lib/bzzoiro/client.ts` — fetch wrapper, `Authorization: Token` header, error envelope handling, pagination helper
- `src/lib/bzzoiro/discovery.ts` — find WC 2026 `league_id` + `season_id` by name match, cache in KV so we don't re-call

Files to **modify**:
- `src/lib/seed/teams.ts` — swap `fetchTeams` import from api-sports to bzzoiro
- `src/lib/seed/fixtures.ts` — swap `fetchFixtures` import + adapt `mapStage` for bzzoiro's round naming (TBD what they call it)
- `wrangler.jsonc` — add `BZZOIRO_BASE_URL` to `vars`, document `BZZOIRO_TOKEN` secret in `.dev.vars.example`
- `src/lib/api-sports/` — keep as-is for now (fallback); delete only after bzzoiro proves out

Files to **leave alone** (already work data-agnostic):
- `src/db/schema.ts`
- `src/lib/locks.ts`
- `src/app/api/admin/seed/route.ts`
- All page/route stubs

### bzzoiro API quick reference

- Base URL: `https://sports.bzzoiro.com/api/`
- Auth: header `Authorization: Token <TOKEN>`
- Pagination: `?limit=50&offset=N` (max 200) on `/events` and `/live`; `?page=N` on others
- Default date window: last 3 hours → next 7 days, unless `?season=ID` is passed
- WC 2026 query shape (once IDs known): `GET /api/events/?league=<id>&season=<id>&full=true`
- Per-match events: `GET /api/events/{id}/incidents/`
- Predicted lineups (BETA, useful for per-round lineup pick UI): `GET /api/predicted-lineup/{event_id}/`

## What's deployed and working RIGHT NOW

- All pages render at https://wc2026.followbuilders.workers.dev (dashboard, stubs for /picks, /leaderboard, /teams, /odds, /users/[email], /picks/lineup/[round])
- D1 `wc2026` exists with all 10 tables created (no data yet)
- KV `CACHE` binding wired (reusing wc2026_worker tracker's namespace)
- 3 cron schedules registered: `*/30 * * * *`, `0 6 * * *`, `0 9 * * *` (route handlers return 501 — wired but not implemented)
- Secrets set in CF: `API_SPORTS_KEY`, `ODDS_API_KEY`, `CRON_SECRET`
- `/api/admin/seed?what=all` is reachable with `x-cron-secret` header — fails with api-sports free-tier error

## Critical operational gotchas

1. **CF Access is NOT in front yet.** The site is currently open to the public. Set up via Zero Trust dashboard (instructions in [README.md](README.md) section "4) Put Cloudflare Access in front").
2. **Existing `wc2026-squads.followbuilders.workers.dev` still points to the old standalone worker.** Per plan, we eventually replace it with a 301 redirect to `/teams` on the new app. Not done yet.
3. **`tracker-snapshot.json` is a frozen May 19 copy.** When new squads are announced, the user manually re-syncs by overwriting `src/data/tracker-snapshot.json` from `../wc2026_worker/teams.json` and redeploying. Day 4 work should make this admin endpoint instead.
4. **Cwd in shell tool resets sometimes.** Always prefix bash with `cd /Users/.../wc2026 &&` to be safe. Symptom: `npm ENOENT package.json` pointing at the worktree path.

## Tasks at handoff time (status = pending unless noted)

Task list inside the harness (numbers may renumber):
- ✅ #1–#17 (Days 1–3.1, all complete and pushed)
- 🚧 #18 _Write src/lib/bzzoiro/{types,client}.ts_ — created, **not started**
- 🚫 (#19 _Discovery helper_ — was about to be created when session was paused)

To start the next session: read this file → confirm with user that bzzoiro is still the plan → request `BZZOIRO_TOKEN` is set → proceed with #18 onwards.

## Suggested next-session skills

- **`feature-dev:feature-dev`** — clean way to spin up the bzzoiro client + seed swap as one feature block
- **`pr-review-toolkit:review-pr`** after the rewrite — catches client/typing issues early
- **`anthropic-skills:handoff`** at end of next session, same way

Skills NOT needed: `brainstorming`, `grilling`, `superpowers:writing-plans` — the plan exists; this is execution.
