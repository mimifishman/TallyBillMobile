---
name: Clerk SSO redirect-URL allowlist
description: Native (exp://) SSO redirect URLs must be allowlisted per Clerk instance; enforcement differs dev vs prod
---

# Clerk SSO redirect-URL allowlist

Self-owned Clerk instances do NOT auto-register native SSO redirect URLs (the old Replit-managed instance did). Every `exp://.../--/sso-callback` URL the mobile app can generate must be added to the instance's allowlist (Dashboard → Configure → SSO redirect URLs, or Backend API `GET/POST /v1/redirect_urls`).

**Why:** After migrating to the user's own Clerk account, Google/Apple sign-in failed with "redirect url ... does not match an authorized redirect URI" on production (`exp://tallybill.app/ios/--/sso-callback`).

**How to apply:**
- Redirect URL shape: `exp://<hostUri>/--/sso-callback`. Dev hostUri = the Expo dev domain; published static build hostUri = `tallybill.app/ios` and `tallybill.app/android` (from the mobile build script's manifest rewrite). Future native builds would use the app.json scheme (`mobile://sso-callback`).
- Dev instance: registered via Backend API with workspace `CLERK_SECRET_KEY`. Note the exp dev-domain entry must be re-added if the repl's dev domain ever changes.
- **Dev instances do not enforce** the allowlist at FAPI sign-in creation (an unregistered redirect URL still succeeds) — you cannot reproduce/verify the prod error against the dev instance. Production instances DO enforce.
- Production instance changes require the user's dashboard (live keys are only in deployment secrets).
