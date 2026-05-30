# Project Orientation Plan

## README Refresh

- [x] Inspect current app structure, scripts, bindings, and runtime dependencies.
- [x] Rewrite README with purpose, tech stack, setup, and operations.
- [x] Verify README references match current project files.
- [x] Document review results.

### Review

- Replaced the stale day-by-day README with current project documentation.
- Added the repo purpose, app surface, tech stack, main routes, install/local setup, D1/KV setup, Clerk setup, data jobs, deploy commands, and maintainer notes.
- Verified referenced scripts against `package.json`, Cloudflare bindings/crons against `wrangler.jsonc`, route names against `src/app`, and env/secrets against current code.

## Remove Test Users

- [x] Identify production rows for the requested test users.
- [x] Delete their dependent picks/scores before deleting users.
- [x] Prevent unapproved signed-in Clerk sessions from recreating deleted D1 users.
- [x] Add an explicit block for the requested test-user emails across access and sync.
- [x] Delete the recreated test rows again.
- [x] Verify they are gone and remaining users still exist.
- [x] Document review results.

### Review

- Removed production users `kunal.morparia@gmail.com`, `kunal.morparia@veeva.com`, and `scheye84@gmail.com`.
- Deleted their rows from `scores`, `lineup_picks`, `group_picks`, `wildcard_picks`, `bracket_picks`, and `tournament_picks` first; those dependent tables had no rows for the three users at delete time.
- They reappeared because the remote KV approval keys still existed; the first KV list checked local state. Reran KV commands with `--remote` and deleted the exact approval keys.
- Added an explicit blocked-user guard for the three test emails so access checks, approval, `requireUser()`, and approved-user sync cannot recreate them.
- Verified `remaining_test_users = 0` immediately after deletion and again after a short delay.
- Remaining production users: `kunmor@gmail.com`, `puneet.lahoty@gmail.com`, `vamsi14@gmail.com`, `chintansanghvi5@gmail.com`, `surilkdesai@gmail.com`, and `viral.running@gmail.com`.

## Approved Users Leaderboard Sync

- [x] Confirm why a newly joined user can be missing from the leaderboard.
- [x] Create D1 user rows when access is approved.
- [x] Sync all approved KV users before leaderboard/scoring reads users.
- [x] Treat existing D1 users as approved registered users when KV approval is absent.
- [x] Verify typecheck/build and deploy.
- [x] Document review results.

### Review

- Root cause: the leaderboard only reads D1 `users`, while join approval can happen before a D1 user row exists.
- `approveAccess()` now normalizes the email, writes the approval KV key, and immediately ensures a matching D1 user row.
- Leaderboard and full score recompute now sync approved KV emails into D1 before reading user rows, so approved users with zero picks/points still appear.
- Access status now treats existing D1 users as approved registered users, which protects current users because the production approved-access KV namespace was empty.
- Added `viral.running@gmail.com` directly to production D1 and verified it exists with display name `viral.running`.
- Production D1 currently has 9 users after the insert.
- `npx tsc --noEmit` passed.
- `npm run build` passed.
- `npm run deploy` deployed Worker version `b5bd67d4-23bc-4ee3-b13b-31a497cc4550`.

## Knockout-Only Lineup Picks

- [x] Remove group-stage lineup from current pick checklist/progress.
- [x] Add a locked lineup section to `/picks` that points to knockout lineups after group stage.
- [x] Block direct group-stage lineup route and saves.
- [x] Remove group-stage lineup scoring/display from public roster views.
- [x] Verify typecheck/build and deploy.

### Review

- `/picks` now includes a Lineup picks section that is locked until the Round of 32 lineup window opens after group stage.
- `/picks/lineup/group` no longer renders the group-stage player picker; it shows a closed-state panel and links back to `/picks#lineups`.
- Server action saves for `round === "group"` are rejected with `Lineup picks open at the knockout stage.`
- Group-stage lineup rows are ignored by scoring and hidden from public roster lineup display.
- Current picks progress now excludes group lineup picks: the current total is 35 instead of 39.
- `npx tsc --noEmit` passed.
- `npm run build` passed.
- `npm run deploy` deployed Worker version `073e2d04-1735-42a4-a3c8-3d87014e441d`.

## Group Odds Second Pick Fix

- [x] Add odds suggestions for group second-place picks from qualifier markets.
- [x] Fill blank second-place picks without overwriting existing picks or duplicating first-place teams.
- [x] Verify typecheck/build and deploy.

### Review

- Root cause: the odds auto-fill only loaded `KXWCGROUPWIN` and only filled rank 1, so rank 2 could never be suggested.
- The odds suggestion loader now also reads `KXWCGROUPQUAL` and picks the highest qualifying-odds team per group excluding the group winner suggestion.
- The `/picks` group button now fills blank 1st and blank 2nd picks, still without overwriting existing picks and without saving automatically.
- `npx tsc --noEmit` passed.
- `npm run build` passed.
- `npm run deploy` deployed Worker version `1d891046-2a1c-4c03-a27a-7cb1027d8e0d`.

## Refresh Access Audit

- [x] Inventory manual refresh controls, admin endpoints, and cron endpoints.
- [x] Hide manual refresh instructions from non-admin pages.
- [x] Remove unused manual refresh UI code.
- [x] Ensure configured Cloudflare crons have a scheduled worker handler.
- [x] Verify non-admin/signed-out manual refresh paths are blocked.
- [x] Verify typecheck/build and deploy.

### Review

- Manual refresh controls visible in the app: `/teams` has `Refresh squads`, rendered only when the signed-in email matches `ADMIN_EMAIL`.
- Manual refresh through `/admin` is gated by `requireAdmin()`, so only `kunmor@gmail.com` can use the curl console.
- Removed the unused qualification stats refresh button component so it cannot be accidentally mounted on `/stats` or `/statsfull`.
- Hid admin refresh instructions from regular users on `/odds` and `/matches` empty states.
- Added a deploy-time scheduled Worker patch. The active cron mapping is now `*/30 * * * *` → `/api/cron/ingest-matches`, `0 6 * * *` → `/api/cron/refresh-odds`, and `0 9 * * *` → `/api/admin/refresh-squads`.
- Confirmed `.open-next/worker.js` includes `async scheduled(...)` after deploy build.
- Live signed-out POST checks returned `403` for `/api/admin/refresh-squads`, `/api/cron/refresh-odds`, `/api/cron/ingest-matches`, and `/api/admin/refresh-qualification-stats`.
- `npx tsc --noEmit` passed.
- `npm run build` passed.
- `npm run deploy` deployed Worker version `834660e8-16a1-4d0c-b052-03459780bf31`.

## Odds-Based Pick Filling

- [x] Add an odds suggestion loader that maps Kalshi snapshots to internal team/player ids.
- [x] Add a fill-only "Use best odds" control for group winner picks.
- [x] Add a fill-only "Use best odds" control for tournament winner, top scorer, and Golden Glove picks.
- [x] Ensure existing user picks are not overwritten and nothing is saved until the user presses Save.
- [x] Verify typecheck/build and deploy.

### Review

- `/picks` now loads odds-backed suggestions from the latest cached Kalshi snapshots.
- Group "Use best odds" fills only blank 1st-place group winners from `KXWCGROUPWIN`; it does not touch 2nd-place picks.
- Tournament "Use best odds" fills only blank champion, top scorer, and Golden Glove fields when those markets match an internal team/player.
- The buttons only update client-side form state. Users must still press Save, and existing picks are left alone.
- `npx tsc --noEmit` passed.
- `npm run build` passed.
- `npm run deploy` deployed Worker version `421886a3-a1f8-4721-a4b9-811444c35399`.

## Scoring Methodology Update

- [x] Remove the stale scoring explanation line from the leaderboard page.
- [x] Normalize wildcard and knockout-stage team picks to 8 points.
- [x] Preserve per-team group scoring: exact rank is 8 points, top-2 wrong rank is 3 points.
- [x] Prevent best-3rd wildcard hedging with teams already used as group top-2 picks.
- [x] Verify typecheck/build.
- [x] Document review results.

## Scoring Tuning Follow-Up

- [x] Reduce lineup goal scoring to 10 points and assist scoring to 5 points.
- [x] Reduce winner-pick losing-finalist fallback to 20 points.
- [x] Review whether 100-point top scorer and golden glove picks distort the scoring balance.
- [x] Verify typecheck/build and deploy.
- [x] Document review results.

## Leaderboard Picks Progress

- [x] Reduce top scorer and golden glove to 50 points each.
- [x] Add current picks-made progress to each leaderboard player row.
- [x] Verify typecheck/build and deploy.
- [x] Summarize remaining open todo items.

### Review

- Top scorer and golden glove are now 50 points each.
- Leaderboard rows now show current pick progress as `made/39 picks made`.
- The 39-pick total is current-open picks: 24 group, 8 wildcard, 3 tournament, and 4 group lineup picks.
- `npx tsc --noEmit` passed.
- `npm run build` passed with the existing Next `middleware` deprecation warning.
- `npm run deploy` deployed Worker version `a1a707ef-7a9a-4a8c-a3f7-3ca92a5506c2`.

## Todo Audit + Tech Debt Cleanup

- [x] Test deprecated `src/middleware.ts` convention migration to `src/proxy.ts`.
- [x] Remove obsolete `/api/picks` 501 stub route.
- [x] Add server validation for top scorer and golden glove player IDs.
- [x] Refresh stale scoring implementation comments.
- [x] Verify typecheck/build.
- [x] Classify remaining todo items by value.

### Review

- Tested moving the Clerk route guard from deprecated `src/middleware.ts` to `src/proxy.ts`; plain Next build passed, but OpenNext Cloudflare deploy failed because Next 16 proxy runs on Node.js and the current Cloudflare adapter needs Edge middleware. Reverted to `src/middleware.ts` for deployability.
- Deleted the obsolete `/api/picks` 501 stub. Pick writes already use server actions.
- Tournament saves now reject unknown top scorer IDs, unknown Golden Glove IDs, and non-GK Golden Glove picks.
- Updated stale scoring comments that still described lineup scoring as stubbed.
- `npm run build` passed and regenerated routes without `/api/picks`.
- `npx tsc --noEmit` passed after clearing stale generated `.next/types`.
- `npm run deploy` deployed Worker version `9e3056dc-69da-4979-90ee-244780d68b7c`.

## Requested Todo Completion

- [x] Restore Stats to the top navigation.
- [x] Improve bracket UX with resolved knockout matchup display and matchup-scoped winner options.
- [x] Verify admin console route/gating as far as possible without an active signed-in admin browser session.
- [x] Refresh stale README/CLAUDE/.dev vars docs away from Cloudflare Access, Firecrawl, and WhoScored assumptions.
- [x] Remove dead WhoScored/Firecrawl scraper code and route.
- [x] Remove the production Clerk/domain cleanup item from todo.
- [x] Verify typecheck/build and deploy.

### Review

- `Stats` is back in the top navigation.
- Bracket picks now show resolved knockout matchups from D1 when available and restrict picks to matchup teams; the server action enforces the same resolved-matchup constraint.
- `/admin` appears in the production build route list and signed-out live access is blocked by Clerk (`x-clerk-auth-status: signed-out`, protected 404). A full signed-in admin click test still requires an active `kunmor@gmail.com` browser session.
- README, CLAUDE.md, and `.dev.vars.example` no longer list Cloudflare Access/Firecrawl/WhoScored as active setup dependencies.
- Dead WhoScored/Firecrawl scraper files and `/api/admin/scrape-fixtures` were removed. The historical D1 column name `whoscored_match_id` remains mapped as `externalMatchId` in TypeScript to avoid a risky migration.
- `npm run build` passed.
- `npx tsc --noEmit` passed after clearing stale generated `.next/types`.
- `npm run deploy` deployed Worker version `0e0a2caf-979f-4573-ad84-ae810426d578`.

## Join Sign-In Flow Fix

- [x] Render email PIN sign-in on `/join` with or without invite code.
- [x] Allow existing Clerk users to request a one-time PIN without an invite.
- [x] Allow new sign-up only when a valid invite code is present.
- [x] Preserve invite approval after verification.
- [x] Verify typecheck/build and deploy.

### Review

- `/join` now renders the custom email PIN form even when no invite code is present.
- Existing Clerk users can request an email-code PIN from `/join`, `/join?code=<valid>`, or `/join?code=<invalid>`.
- New sign-up is blocked unless the server confirmed the invite code matches `INVITE_CODE`.
- Valid invited users still get approved in KV after verification and redirected into the app.
- `npx tsc --noEmit` passed.
- `npm run build` passed.
- `npm run deploy` deployed Worker version `cf74a77a-5a5a-46bd-a0d9-5bc4e0a2185a`.
- A post-deploy `curl /join` smoke check could not complete because DNS resolution failed locally, but deployment itself completed successfully.

## Squad Refresh JSON Parse Fix

- [x] Reproduce the Anthropic prose-before-JSON parse failure.
- [x] Make squad refresh extract a valid JSON object from fenced or prose-wrapped responses.
- [x] Return a clearer error when no JSON object is present.
- [x] Verify typecheck/build and deploy.

### Review

- Root cause: Anthropic sometimes returned prose before the requested JSON, so `JSON.parse()` saw the first `B` in `Based on...` instead of `{`.
- `extractJsonText()` now scans for the first complete JSON object, handles fenced/prose-wrapped/trailing-text responses, and preserves braces inside strings.
- Responses with no JSON object now throw a clearer `Squad refresh returned no JSON object...` error.
- Focused parser cases passed for prose before JSON, fenced JSON, trailing prose, and no-JSON error handling.
- `npx tsc --noEmit` passed.
- `npm run build` passed.
- `npm run deploy` deployed Worker version `6d251102-50da-45c8-b2d8-b3dc5eeab7f5`.

- [x] Inventory project structure, scripts, dependencies, and framework constraints.
- [x] Read relevant Next.js local docs before assuming conventions.
- [x] Map core routes, components, data sources, and UI flow.
- [x] Run lightweight verification to confirm the app is healthy enough to inspect.
- [x] Document findings, risks, and follow-up questions.

## Orientation Review

Completed: 2026-05-27

### Project Shape

- WC2026 Pick'em is a private FIFA World Cup 2026 predictions app built on Next.js 16 App Router, React 19, Tailwind 4, Clerk auth, OpenNext Cloudflare, D1, KV, Drizzle, api-sports/WhoScored ingestion, and The Odds API.
- The deployed app surface is the protected `(app)` route group: dashboard, picks, lineup rounds, teams, matches, leaderboard, odds, and public per-user locked roster views.
- The join flow uses Clerk plus an invite-code approval stored in KV. Current code has moved away from the older Cloudflare Access-only docs.
- Most pages are Server Components. Interactive islands are scoped to nav, teams filtering, admin buttons, and pick forms.
- Writes are concentrated in server actions (`src/app/(app)/picks/actions.ts`) and privileged API route handlers under `src/app/api/admin` and `src/app/api/cron`.

### Verification

- `npm install` was required because `@clerk/nextjs` was declared but missing from `node_modules`.
- `npm run build` passed after allowing the Next build to bind localhost. It warned that the `middleware` file convention is deprecated in favor of `proxy`.
- `npx tsc --noEmit` passed after `next build` regenerated `.next/types`.
- `npm install` reported 12 moderate audit findings; no dependency changes were made beyond installing the lockfile contents.

### Risks / Follow-Ups

- `src/middleware.ts` migration is currently blocked by OpenNext Cloudflare: Next 16 proxy is Node.js-only, while this worker deploy needs Edge middleware.
- `/api/*` bypasses Clerk middleware by design, so every API route must stay self-gated.
- `src/app/api/picks/route.ts` was removed during the todo audit cleanup; actual pick writes use server actions.
- `src/components/picks/bracket-section.tsx` now shows resolved knockout fixtures when they exist in D1.
- `src/app/(app)/picks/actions.ts` now validates tournament winner, top scorer, and Golden Glove player IDs.
- `src/app/(app)/leaderboard/page.tsx` previously contained a stale `group exact = {}` scoring line; this was removed in the scoring methodology update.
- `wrangler.jsonc` contains an invite code in config. Treat it as a shareable join link, not a secret, or move it if repo visibility changes.

## Join Auth Debug

Completed: 2026-05-27

- Reproduced the live join page rendering an empty auth area.
- Root cause: the deployed worker was stale and did not include the local Clerk proxy configuration. Live HTML had `proxyUrl: ""` and no Clerk browser script; local build output had `/api/clerk-proxy`.
- Deployed current local build to Cloudflare Worker version `caa66d13-2b00-47d1-9864-eb407bf21cdb`.
- Verified the live join page now renders the Clerk form with email and password inputs, and the Clerk script loads through `https://wc2026.followbuilders.workers.dev/api/clerk-proxy/...`.

### Follow-Up: Continue Button

Completed: 2026-05-27

- Reproduced the Clerk form rendering but not advancing after email submission.
- Evidence: `/api/clerk-proxy/v1/environment` and `/api/clerk-proxy/v1/client` failed. The custom proxy returned `501`; Clerk's official proxy handler then returned `host_invalid` because the production Clerk domain is `followbuilders.workers.dev` and Clerk will not accept `wc2026.followbuilders.workers.dev` as a proxy URL on the current plan.
- Tried configuring the production Clerk domain through the Backend API using a temporary token-gated route; primary-domain proxy was rejected as cross-domain, and adding `wc2026.followbuilders.workers.dev` as a satellite domain was rejected because `app:domains` is not available on the current Clerk plan.
- Unblocked the live app by switching back to the working Clerk test instance, updating the deployed `CLERK_SECRET_KEY` to the matching test secret, and removing the hardcoded Clerk proxy URL.
- Verified `npm run build`, `npx tsc --noEmit`, deploy version `4210c231-54fe-48a6-910b-3f04dba9dac9`, and browser behavior: entering an email and pressing Continue advances to `/join/create`.
## Email PIN Join Auth

- [x] Replace Clerk's prebuilt join UI with a custom email PIN form.
- [x] Support existing-user sign-in via Clerk `email_code`.
- [x] Support new-user sign-up via Clerk email address verification.
- [x] Preserve invite-code approval by redirecting verified sessions back through `/join?code=...`.
- [x] Verify locally, deploy, and check live browser behavior has no password auth.

### Review

- `npx tsc --noEmit` passed.
- `npm run build` passed.
- `npm run deploy` deployed Worker version `5b11fac2-2910-4fc3-bf19-ccbc2e043ae0`.
- Live browser snapshot confirmed the join page shows only Email + Continue while signed out.
- `/join/create` now redirects to `/join`.
- Browser automation could not submit the email form because it hit a Codex usage-limit guard; manual verification should try the Continue button once from the in-app browser.

## Admin Curl Console

- [x] Approve a same-origin curl runner design instead of server-side shell execution.
- [x] Write implementation plan.
- [x] Build `/admin` server-gated page for `ADMIN_EMAIL`.
- [x] Build client curl parser/runner for same-origin app endpoints.
- [x] Show per-command progress and final response output in the admin runner.
- [x] Add admin navigation entry.
- [x] Verify typecheck/build and signed-out route guard behavior.
- [ ] Manually verify `/admin` after signing in as `kunmor@gmail.com`.

### Review

- `npx tsc --noEmit` passed.
- `npm run build` passed and included `/admin`.
- `npm run deploy` deployed Worker version `46325c71-fb39-4b9f-a10c-75cbe891e93f`.
- Signed-out `/admin` requests are blocked by Clerk middleware.
- The in-app browser session was signed out, so I could not verify the admin-only console UI with a live admin session.

### Follow-Up: Command Progress

- Added a live progress panel that logs parse, request start, waiting heartbeat, response receipt, response-byte count, and formatting.
- Errors now appear both in the error banner and in the progress trail with elapsed time.
- `npx tsc --noEmit` passed.
- `npm run build` passed.
- `npm run deploy` deployed Worker version `38021cbb-39ed-4e7b-b719-7143f6f1a709`.

## WhoScored Stats + Fixtures Debug

- [x] Identify why Firecrawl can succeed without parsed qualification stats.
- [x] Add structured extraction fallback for qualification stats pages.
- [x] Update WC 2026 fixture discovery to use the current WhoScored stage URL.
- [x] Verify typecheck/build and deploy.

### Investigation Notes

- Direct `curl` to WhoScored returns Cloudflare block HTML, so the app must keep using Firecrawl or another browser-backed fetch.
- Root cause for the stats error: `refreshQualificationStats()` only parsed markdown tables. WhoScored statistics grids are loaded dynamically, so Firecrawl can return markdown successfully while no markdown table exists to parse.
- `/matches` already reads D1 `matches`; it was empty because fixtures had not been imported. The importer was still hardcoded to older WC 2026 stage IDs instead of the current stage URL `https://www.whoscored.com/regions/247/tournaments/36/seasons/10498/stages/25505/show/international-fifa-world-cup-2026`.

### Review

- Qualification stats now ask Firecrawl for markdown plus structured JSON extraction, using markdown tables first and JSON extraction as fallback.
- WC 2026 fixture import now scrapes the current WhoScored stage URL and keeps the existing D1 upsert/import endpoint contract.
- `npx tsc --noEmit` passed.
- `npm run build` passed.
- `npm run deploy` deployed Worker version `85222e9a-e140-4096-82b2-66829da28788`.

## Squad Pulling Update

- [x] Compare attached `wc2026-worker.js` squad update flow with current app refresh route.
- [x] Add shared squad refresh/apply logic based on the attached worker.
- [x] Update `/api/admin/refresh-squads` to use direct KV + Anthropic web-search update flow.
- [x] Update `/teams` to read compatible KV keys.
- [x] Verify typecheck/build.

### Review

- Ported the attached worker's KV parsing, pending-team prompt, Anthropic web-search call, and update application flow into `src/lib/squads/refresh.ts`.
- `/api/admin/refresh-squads` now runs that flow directly and also accepts manual `{ "updates": [...] }` bodies.
- `/teams` now reads app KV, legacy tracker KV, then bundled snapshot.
- Documented `ANTHROPIC_API_KEY` in `.dev.vars.example`, `README.md`, and `CLAUDE.md`.
- `npx tsc --noEmit` passed.
- `npm run build` passed.
- `npm run deploy` deployed Worker version `af176880-5883-4e97-bd0c-ea56914e5caf`.

## Qualification Stats Page

- [x] Confirm Firecrawl should power WhoScored scraping.
- [x] Add shared qualification stats scraper/cache logic.
- [x] Add admin refresh endpoint for qualification stats.
- [x] Add `/stats` page with player/team top-20 tables for UEFA, CONMEBOL, CAF, CONCACAF, and AFC.
- [x] Add stats navigation link and admin-only refresh control.
- [x] Verify typecheck/build and deploy.

### Review

- Added Firecrawl-based WhoScored scraping in `src/lib/qualification-stats.ts`.
- Added `/api/admin/refresh-qualification-stats`, gated by `requirePrivileged`.
- Added `/stats` page that reads cached KV stats and displays top player/team tables by confederation.
- Added `Stats` nav link and admin-only refresh button.
- `npx tsc --noEmit` passed.
- `npm run build` passed and listed `/stats` plus `/api/admin/refresh-qualification-stats`.
- `npm run deploy` deployed Worker version `256e8965-434f-43ab-a1fe-c72832d0cae0`.
- Signed-out `/stats` is protected by Clerk middleware, and signed-out refresh POST returns 403.

### Follow-Up: Explicit Confederation URLs

- [x] Added explicit WhoScored tournament URLs for CAF, CONMEBOL, CONCACAF, and AFC.
- [x] Updated stats refresh to discover each competition's stage stats links from its own tournament page instead of relying on the UEFA dropdown.
- [x] `npx tsc --noEmit` passed.
- [x] `npm run build` passed.
- [x] `npm run deploy` deployed Worker version `4842dbc2-0821-4493-a631-503878a050f0`.

## FotMob Stats + Fixtures Replacement

- [x] Confirm FotMob league IDs and embedded data shape for UEFA, CONMEBOL, CAF, CONCACAF, and AFC qualification.
- [x] Replace WhoScored/Firecrawl qualification stats refresh with FotMob Next payload + stat feed parsing.
- [x] Add qualification group tables and per-category player/team stat tables to `/stats`.
- [x] Replace WC 2026 fixture discovery/import with FotMob league 77 fixtures.
- [x] Verify typecheck/build and deploy.

### Investigation Notes

- WhoScored was the wrong dependency for this flow: Firecrawl could succeed while the dynamic stat grid still produced zero parseable rows.
- FotMob exposes qualification source pages through SSR `__NEXT_DATA__` and category feeds under `https://data.fotmob.com/stats/...`.
- Current FotMob IDs: UEFA `10195`, CONMEBOL `10199`, CAF `10196`, CONCACAF `10198`, AFC `10197`, and World Cup 2026 fixtures `77`.

### Review

- `npx tsc --noEmit` passed.
- `npm run build` passed.
- `npm run deploy` deployed Worker version `7a72aa13-d07a-47b5-9f23-8ea4ef349500`.
- Live signed-out checks for `POST /api/admin/discover-fixtures` and `POST /api/admin/refresh-qualification-stats` both returned `403`, confirming the admin gate is still active.

### Follow-Up: Empty Live Stats Cache

- [x] Verified remote `qualification-stats:latest` was missing from production KV.
- [x] Built a one-time FotMob payload locally from FotMob pages/stat feeds.
- [x] Uploaded the payload to remote KV namespace `1c46e4b823d540ffa7cef3d1cf7ffaef`.
- [x] Fixed CONMEBOL standings parsing for single-table competitions.
- [x] Verify typecheck/build and deploy the parser fix.

### Follow-Up Review

- Remote KV now contains `qualification-stats:latest`.
- The generated payload is about 806 KB and includes 46 standings tables/sections, 171 player stat categories, and 138 team stat categories across the five qualification competitions.
- `npx tsc --noEmit` passed.
- `npm run build` passed.
- `npm run deploy` deployed Worker version `49d59726-6e8d-49f6-8eb4-c3bc21715344`.

### Follow-Up: Stats Page Split

- [x] Move the full stats view to `/statsfull`.
- [x] Reduce `/stats` to group tables plus player goals and assists.
- [x] Hide stats from the top navigation.
- [x] Verify typecheck/build and deploy.

### Stats Page Split Review

- `npx tsc --noEmit` passed.
- `npm run build` passed and listed both `/stats` and `/statsfull`.
- `npm run deploy` deployed Worker version `8afceae5-56c9-4e53-a57f-0fc02ef3fd6d`.

## Odds Source Investigation

- [x] Query SportsGameOdds with the provided API key for World Cup-window soccer events and markets.
- [x] Check whether team finish / group-stage / player World Cup markets exist as event, prop, or futures-like records.
- [x] Compare available SportsGameOdds categories with the current `/odds` page model.
- [x] Summarize what can be built next and any source limitations.

### Review

- SportsGameOdds key is valid but current plan exposes only NBA, NFL, MLB, NHL, NCAAB, NCAAF, MLS, and UEFA Champions League. `INTERNATIONAL_SOCCER` and `MARKETS` returned subscription-tier lock errors, so World Cup 2026 odds are not available through this SportsGameOdds key.
- Kalshi public market data exposes World Cup series that match the desired odds page direction: tournament winner, group winner, group qualifier, exact group order, reach round, stage of elimination, awards, squad selection, game winner, team goals, and total group goals.
- Best next source for this app is likely direct Kalshi market ingestion, not SportsGameOdds, unless the SportsGameOdds subscription is upgraded to include International Soccer / Markets.

## Kalshi Odds Page

- [x] Replace The Odds API refresh with direct Kalshi World Cup series snapshots.
- [x] Keep using `odds_snapshots` for cached read-only odds payloads.
- [x] Rebuild `/odds` around team finishes, group-stage odds, and player markets.
- [x] Preserve admin/cron-triggered refresh behavior.
- [x] Verify typecheck/build.

### Review

- Added `src/lib/odds/kalshi.ts` with read-only public Kalshi market fetching and normalization.
- Updated `refreshOdds()` to persist Kalshi series snapshots in the existing `odds_snapshots` table.
- Rebuilt `/odds` to show team finishes, group-stage contracts, and player markets with YES bid/ask, last price, volume, and status.
- The page falls back to live Kalshi fetches if no cached odds snapshots exist yet, then daily cron/admin refreshes can populate D1.
- `npx tsc --noEmit` passed.
- `npm run build` passed.
- `npm run deploy` deployed Worker version `07103c3d-64b4-48c4-b6ec-9d8fde7c6427`.
- Live signed-out `/api/cron/refresh-odds` still returns `403`.

### Follow-Up: Live Server Error

- [x] Removed live Kalshi fan-out from `/odds` render when production D1 has no cached Kalshi snapshots.
- [x] Added a safe empty state for missing cached snapshots.
- [x] Deployed Worker version `26a56d80-c710-47f8-973c-382569ac9be7`.
- [x] Loaded a one-time compact Kalshi snapshot into remote D1.
- [x] Verified remote D1 has 11 `kalshi:%` odds snapshot rows.
- [x] Added a lesson to avoid render-time external fan-out fallbacks for protected pages.

## FotMob Match Ingestion + Static Stats UI

- [x] Trace current stats refresh and matches ingestion code paths.
- [x] Inspect FotMob match payload shape for result, events, and stats.
- [x] Remove stats refresh UI and match scrape buttons.
- [x] Replace WhoScored match ingestion with FotMob match ingestion after kickoff + 4h.
- [x] Show kickoff time in both UTC and PST on `/matches`.
- [x] Verify typecheck/build and deploy.

### Review

- Removed the stats refresh button from both `/stats` and `/statsfull`.
- Removed the per-match scrape button from `/matches`.
- Added FotMob match ingestion in `src/lib/fotmob/scrape-and-save.ts`; cron now checks eligible matches 4 hours after kickoff.
- Saved FotMob match stat groups alongside scoring events in `raw_events`, while keeping old array-only manual rows compatible.
- `/matches` now shows kickoff in UTC and Pacific time and can expand saved FotMob stat groups after ingestion.
- `POST /api/admin/scrape-match` and `POST /api/admin/scrape-and-save` now use FotMob URLs/data.
- `npx tsc --noEmit` passed.
- `npm run build` passed.
- `npm run deploy` deployed Worker version `b834d319-4e2e-4d1c-85e1-7712a2b5610a`.
- Live signed-out checks for `POST /api/cron/ingest-matches` and `POST /api/admin/scrape-match` both returned `403`.
- Live signed-out HTML no longer includes a top-menu `Stats` link.
