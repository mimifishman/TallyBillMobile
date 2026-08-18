---
name: Clerk Frontend API domain (external instance)
description: How the app reaches Clerk's Frontend API after migrating to the user-owned Clerk account — native CNAME domain, no proxy.
---

# Clerk Frontend API access

**Rule:** Clerk SDKs must talk to the Frontend API natively — the `pk_live_...` publishable key decodes to `clerk.tallybill.app` (CNAME, verified working). Never reintroduce a Clerk FAPI proxy (`/api/__clerk` route, `proxyUrl` on ClerkProvider, `Clerk-Proxy-Url` headers, proxy env vars).

**Why:** proxy-style attribution against `frontend-api.clerk.dev` returns `host_invalid` for this instance (Clerk dashboard proxy validation fails the same way), while the native CNAME domain works. A shipped-but-unregistered proxy broke production sign-in. The proxy was only ever a workaround from the Replit-managed Clerk era.

**How to apply:** on `host_invalid` auth failures, check whether requests go through a proxy path instead of the native FAPI domain, and confirm the publishable key's base64 suffix decodes to the expected `clerk.<domain>` host.

Related: the old Replit-managed Clerk app kept re-injecting `CLERK_*` test secrets at every publish until it was deleted (Auth pane → Configure → "Delete Clerk app"). If phantom Clerk secrets reappear, suspect a re-attached managed Clerk integration, not the codebase.
