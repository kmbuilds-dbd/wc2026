# Email PIN Join Auth Plan

## Goal

Replace the Clerk prebuilt join UI with a focused email PIN flow. The join page should not expose password or social sign-in options, and successful verification should keep using Clerk sessions and the existing invite-code approval path.

## Tasks

- [x] Replace `/join` prebuilt `<SignIn />` with a server wrapper plus client email PIN form.
- [x] Implement email-code sign-in for existing users and email-code sign-up for new users.
- [x] Redirect successful auth through `/join?code=...` so KV approval remains server-side.
- [x] Hide sign-out controls unless Clerk reports a signed-in user.
- [x] Verify typecheck/build, deploy, and browser behavior on the live Worker.

## Review

- `npx tsc --noEmit` passed.
- `npm run build` passed.
- `npm run deploy` deployed Worker version `5b11fac2-2910-4fc3-bf19-ccbc2e043ae0`.
- Live browser snapshot showed only the custom email field and Continue button; no password, Google, or sign-out controls appeared while signed out.
- `curl -I /join/create` returned `307` to `/join`, so old Clerk subroutes no longer expose prebuilt auth.
- Interactive email submission could not be completed by the browser automation because the tool hit a Codex usage-limit guard.

## Notes

- Clerk session duration is controlled by the Clerk instance. Use Clerk's session cookie rather than adding an app-owned auth cookie.
- Keep the old `/api/clerk-proxy` helper in place for future production-domain work, but the test key path should continue loading directly from Clerk.
