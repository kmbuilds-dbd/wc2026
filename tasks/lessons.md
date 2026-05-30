# Lessons

- When auth behavior is user-facing, confirm the intended sign-in strategy before deploying fixes. Do not assume password auth is acceptable just because Clerk's prebuilt UI renders it.
- For Clerk on `workers.dev`, production domain/proxy support has plan and domain constraints. Verify Clerk Dashboard/API constraints before committing to production keys.
- For admin-only UI, use the configured admin identity (`ADMIN_EMAIL`) as the display gate. Do not rely on mutable database role flags unless the user explicitly wants role-based admin access.
- For WhoScored stage pages, do not assume the visible `/show/...` URL is the scrapeable fixture source. Prefer the sibling `/fixtures/...` URL for dated match lists, and include response diagnostics when a scrape parses zero rows.
- When the user reports repeated zero-row scraper results, stop layering fallbacks onto the same fragile source. Re-evaluate the data source and prefer deterministic embedded JSON/API payloads, like FotMob `__NEXT_DATA__` plus `data.fotmob.com` feeds, over rendered-table scraping.
- After adding a KV-backed page, populate or verify the production KV key before saying the page is ready. A successful deploy does not create cache data by itself.
- When exposing dense diagnostic/admin-style pages, keep the public navigation focused. Put full/debug views behind explicit URLs and keep the main route curated for the core user workflow.
- For one-time static extracts, do not leave refresh controls on the user-facing page. Keep any re-ingestion behind admin/API paths unless the user asks for an on-page control.
- Do not make protected user-facing pages depend on large external fan-out during server render as a fallback for an empty cache. Render a safe empty state and populate D1/KV through admin or cron refresh paths.
- When parsing AI/API responses that are supposed to be JSON, defensively extract and validate the JSON object instead of assuming the response contains no prose, fences, or trailing text.
- When adding "auto-fill" helpers, map every visible field to an explicit data source. If a section has first and second picks, verify both positions are filled or deliberately documented as unavailable.
- When the visible membership list is backed by D1 but access approval is backed by KV/Clerk, create or reconcile the D1 user row at the approval boundary. Do not rely on a later authenticated page visit to make joined players visible.
- For production Cloudflare KV cleanup, always pass `--remote` when using wrangler. Binding-based KV commands default to local state and can falsely suggest production approval keys are absent.
