---
name: Clerk auth testing constraints
description: How to e2e-test Clerk auth flows in this project without hitting captcha walls
---

# Testing Clerk auth flows

**Rule:** Do not e2e-test email/password *registration* through the UI — the Clerk dev instance has bot protection enabled (Turnstile "smart" captcha on sign-ups), and Turnstile cannot complete in an automated browser. The register screen's submit button spins indefinitely with no error (no `POST /v1/client/sign_ups` is ever sent).

**How to apply:**
- To test signed-in flows, pre-create a user via the Clerk Backend API (`POST https://api.clerk.com/v1/users` with `$CLERK_SECRET_KEY`, email like `something+clerk_test@example.com`), then have the tester *sign in* — sign-ins have no captcha.
- `+clerk_test` emails accept verification code `424242`.
- OAuth (Google/Apple) buttons can be verified up to the provider's account-chooser screen (popup opens, no inline error), but the full OAuth completion needs a real account — don't attempt it.
- Expo web is served directly at `https://$REPLIT_EXPO_DEV_DOMAIN` (bypasses the shared proxy); first bundle takes 30–60s.
