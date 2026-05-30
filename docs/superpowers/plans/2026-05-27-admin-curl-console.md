# Admin Curl Console Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an admin-only `/admin` page where `kunmor@gmail.com` can paste a curl command for same-origin app endpoints and execute it through browser `fetch()`.

**Architecture:** The server page gates access with `requireAdmin()` before rendering. A client component parses a constrained curl command into a same-origin request, executes it with credentials, and displays status plus response body. Navigation shows an Admin link only for the configured admin email while the server page remains the real authorization boundary.

**Tech Stack:** Next.js App Router, React client component, Clerk current-user auth, Tailwind CSS.

---

### Task 1: Admin Page Gate

**Files:**
- Create: `src/app/(app)/admin/page.tsx`

- [x] Create a server component at `/admin` that calls `requireAdmin()` and renders the console shell.
- [x] Use existing project typography and surface styles.

### Task 2: Curl Runner Client

**Files:**
- Create: `src/app/(app)/admin/curl-runner.tsx`

- [x] Tokenize common curl forms with quotes and line continuations.
- [x] Parse method, same-origin URL/path, headers, and request body.
- [x] Block external URLs and unsupported curl flags with a visible error.
- [x] Execute with `fetch(..., { credentials: "same-origin" })`.
- [x] Display HTTP status and formatted JSON/text response.

### Task 3: Admin Navigation

**Files:**
- Modify: `src/components/nav-bar.tsx`

- [x] Add an Admin nav link for `kunmor@gmail.com`.
- [x] Keep server-side `/admin` authorization as the source of truth.

### Task 4: Verification

**Commands:**
- [x] Run `npx tsc --noEmit`.
- [x] Run `npm run build`.
- [x] Run/deploy and verify `/admin` is present in the route list.
- [x] Verify signed-out `/admin` requests are blocked by Clerk middleware.
- [ ] Verify `/admin` renders for `kunmor@gmail.com` and curl parsing works against `/api/admin/recompute` from an authenticated admin browser session.

## Review

- `npx tsc --noEmit` passed.
- `npm run build` passed and listed `/admin`.
- `npm run deploy` deployed Worker version `46325c71-fb39-4b9f-a10c-75cbe891e93f`.
- `curl -I https://wc2026.followbuilders.workers.dev/admin` returned a signed-out Clerk-protected response instead of exposing the console.
- The in-app browser was not authenticated and landed on `/join?redirect_url=...`, so admin-session UI execution remains a manual verification step.
