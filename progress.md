# progress.md — pick-up state for WC2026 pick'em

**Live URL:** https://wc2026.followbuilders.workers.dev (CF Access NOT yet in front — currently open)
**Repo:** https://github.com/kmbuilds-dbd/wc2026 (private)
**Today:** 2026-05-20 · **Ship deadline:** 2026-06-09 (2 days before WC kickoff 2026-06-11)

Source-of-truth artifacts (read first, don't re-derive):
- Implementation plan: `/Users/kunalmorparia/.claude/plans/with-https-raw-githubusercontent-com-mul-hashed-rabbit.md`
- Project orientation: [CLAUDE.md](CLAUDE.md)
- Deploy + ops runbook: [README.md](README.md)
- Latest commits: `git log --oneline -10`

## Current sprint state

| Block | State |
|---|---|
| Day 1–2 Scaffold + adapter + theme + auth + stubs | ✅ commit `a3f1c5e` |
| Day 1–2.5 D1 binding + migrations applied to remote | ✅ commit `655ed87` |
| Day 3 api-sports/odds clients, seed pipeline, D1-backed locks | ✅ commit `05d7f7c` (api-sports code remains, awaiting paid plan) |
| Day 3.1 x-cron-secret bypass on admin endpoints | ✅ commit `6f789b2` |
| Day 3.2 bzzoiro probe — verified bzzoiro WC 2026 has only placeholder bracket events | ✅ commits `88b0e7d`/`c8983b7`/`44677da`; debris **deleted** in commit `<pending>` |
| **Data provider decision** | 🟡 **DEFERRED to ~Jun 7** (see below) |
| **Day 4–5 Squad tracker port → /teams** | 🚧 **in progress** (this session) |
| Day 6–8 Pick UI | ⏸ blocked on data seed |
| Day 9–11 Scoring engine + ingest cron | ⏸ blocked on data provider decision |
| Day 12–13 Lineup builder | ⏸ blocked on data seed |
| Day 14–15 Public roster + polish | ⏸ |
| Day 16–17 Odds page | ⏸ (api-football Pro plan includes odds → may delete `src/lib/odds/`) |
| Day 18–19 E2E | ⏸ |

## Data provider decision — DEFERRED

5 providers evaluated. None of the free options actually work for WC 2026:

| # | Provider | Verdict |
|---|---|---|
| 1 | api-sports / api-football Free | 2025+ seasons blocked (`{ "plan": "Free plans do not have access to this season, try from 2022 to 2024." }`) |
| 2 | balldontlie GOAT | $40/mo — 2× our needs, no rewrite advantage |
| 3 | TheSportsDB free / $9 | No top-scorers endpoint, tight per-endpoint rate limits |
| 4 | bzzoiro Free | WC 2026 league exists (id=27, season=188) but only **26 placeholder bracket-slot events** (`"1A"`, `"3C/3E/..."`, `"W73"`). Group stage absent. Unusable. |
| 5 | Apify macheta/football-super-fast-data | Pay-per-CU pricing ~$128 estimate, community-maintained, no WC 2026 confirmation, async-job integration model |

**The realistic options are:**

- **A — api-football Pro $19/mo (2 prepaid months = $38 total covering Jun + Jul)**. All endpoints including odds (so `src/lib/odds/` would be deleted). Our existing `src/lib/api-sports/` code already targets this. Subscribe ~Jun 9 to avoid wasted month-1, renew once Jul 9, cancel after Jul 19.
- **B — $0 hybrid: hardcoded fixtures from FIFA's public schedule + admin manual scoring**. Delete all third-party API code, write fixture seed from FIFA's published schedule (~50 LOC), build an admin form for entering match results + scorers. ~4h rewrite. Admin spends ~2 min × ~64 matches = ~2h during tournament.

**Decision held until ~Jun 7-8** so the user can ship Day 4–5 (squad tracker port — no API needed) and Day 6–8 (pick UI — works with hardcoded team list from the bundled tracker snapshot) first. The data-source choice doesn't affect the rest of the build.

## What's deployed and working RIGHT NOW

- All pages render at https://wc2026.followbuilders.workers.dev (dashboard + stubs)
- D1 `wc2026` exists, 10 tables migrated, **empty** (no data yet)
- KV `CACHE` binding wired (reuses wc2026_worker tracker's namespace)
- 3 cron schedules registered (route handlers return 501)
- Secrets in CF: `API_SPORTS_KEY` (free tier, unusable), `ODDS_API_KEY`, `CRON_SECRET`, `BZZOIRO_TOKEN` (vestigial — can be deleted)
- `/api/admin/seed?what=all` is reachable with `x-cron-secret` header — fails with api-sports free-tier error

## Critical operational gotchas

1. **CF Access is NOT in front yet.** Site is openly accessible. Set up in Zero Trust dashboard per [README.md](README.md) section "4) Put Cloudflare Access in front" before sharing with the group.
2. **Old `wc2026-squads.followbuilders.workers.dev` worker still serves the old tracker.** Replace with 301 redirect to `/teams` on new app after Day 4 ports the tracker.
3. **`src/data/tracker-snapshot.json` is a May 19 frozen copy** of `wc2026_worker/teams.json`. When new squads are announced, manually re-copy + redeploy. Day 4+ might add an admin endpoint for this.
4. **Cwd in shell tool resets sometimes.** Always prefix bash with `cd /Users/.../wc2026 &&`. Symptom: `npm ENOENT package.json` pointing at the worktree path.
5. **Vestigial secrets** in CF: `BZZOIRO_TOKEN` (probe is deleted, can `wrangler secret delete BZZOIRO_TOKEN`).

## Suggested next-session skills

- `feature-dev:feature-dev` for the data-source decision + pick-UI build (Day 6–8)
- `pr-review-toolkit:review-pr` before merging substantial changes
- `anthropic-skills:handoff` at end of each session
