# TallyBill Workspace

## Overview

TallyBill is a mobile bill-splitting app (Expo/React Native) backed by an Express API server, built in a pnpm workspace monorepo using TypeScript.

## Project Goal

Recreate the TallyBill Django web app (https://github.com/mimifishman/TallyBill) as a mobile app with:
- Scan receipts with Veryfi OCR (Hebrew text supported via word reversal)
- Split bills with color-coded person assignment per line item
- Optional login — guests can use app but no history
- Tax + tip per bill, per-person tip override
- Bill sharing via 6-char join code
- Design: clean, green #1F883D accent, white background

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Mobile**: Expo SDK 54, Expo Router, TanStack Query, Inter fonts
- **Auth**: Clerk (social login + email/password). Server uses `@clerk/express` with `getAuth()` to validate tokens and map Clerk user IDs to local integer user IDs via a `clerkId` column on the users table. Mobile uses `@clerk/expo` (ClerkProvider + useSignIn/useSignUp/useSSO hooks). Clerk SDKs talk directly to the instance's Frontend API at `clerk.tallybill.app` (derived from the publishable key); there is no Clerk proxy.

## Artifacts

| Artifact | Port | Description |
|---|---|---|
| `artifacts/api-server` | 8080 | Express API server |
| `artifacts/mobile` | 18115 | Expo React Native mobile app |
| `artifacts/mockup-sandbox` | 8081 | Component preview server (Canvas) |

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

## Environment Variables Required

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string (provisioned by Replit) |
| `JWT_SECRET` | Secret for signing JWTs (defaults to dev secret if not set) |
| `VERYFI_CLIENT_ID` | Veryfi API client ID for OCR |
| `VERYFI_CLIENT_SECRET` | Veryfi API client secret |
| `VERYFI_USERNAME` | Veryfi account username |
| `VERYFI_API_KEY` | Veryfi API key |

## DB Schema

Tables: `users`, `bills`, `bill_members`, `bill_users`, `bill_lines`, `bill_line_users`

- `bills.join_code` — 6-char uppercase alphanumeric code for bill sharing
- `bill_users` — split participants with a color and optional `tip_override`
- `bill_line_users` — many-to-many: which persons share each line item
- `bill_members` — tracks which app accounts have access to a bill

## Mobile App Routes

| Route | Screen |
|---|---|
| `/` | Redirect (auth → bills, guest → new bill, neither → login) |
| `/(auth)/login` | Login screen with guest option |
| `/(auth)/register` | Registration screen |
| `/(tabs)/bills` | Bill history (requires login) |
| `/(tabs)/settings` | Settings + join bill by code |
| `/bill/new` | Create new bill |
| `/bill/[id]` | Bill detail — people, line items, scan |
| `/bill/[id]/scan` | OCR receipt scan via Veryfi |
| `/bill/[id]/totals` | Per-person totals with tip override |
| `/bill/[id]/share` | Share join code & join another bill |
| `/bill/join` | Join bill by code (redirect) |

## API Routes

- `POST /api/auth/register` — register user
- `POST /api/auth/login` — login user
- `GET /api/bills` — list bills (auth required)
- `POST /api/bills` — create bill (optional auth, guest OK)
- `POST /api/bills/join` — join bill by code (auth required)
- `GET /api/bills/:id` — get bill + lines + users (no auth required)
- `PUT /api/bills/:id` — update bill
- `DELETE /api/bills/:id` — delete bill (owner only)
- `GET/POST/PUT/DELETE /api/bills/:id/lines` — line item CRUD
- `POST /api/bills/:id/lines/:lineId/users` — toggle person assignment
- `POST /api/bills/:id/lines/bulk` — bulk create lines from OCR
- `GET/POST/PUT/DELETE /api/bills/:id/users` — bill participants (with colors)
- `GET /api/bills/:id/totals` — per-person totals (subtotal, tax share, tip)
- `POST /api/ocr` — Veryfi OCR proxy (Hebrew text reversal built-in)
- `GET /api/currency` — detect currency from IP geolocation

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
