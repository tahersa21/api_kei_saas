---
name: CommandCode project structure
description: Full-stack AI proxy. Key routes, auth, and DB facts.
---

## Routes
- `/` — Landing (public); signed-in → redirect `/app`
- `/sign-in`, `/sign-up` — Clerk auth
- `/app` — User dashboard (Clerk required); 9 pages; self-service API keys
- `/chat` — Public chatbot (CC + RC streaming)
- `/taherlt` — Secret admin console (ADMIN_PASSWORD only, no email)
- `/dashboard` — Admin stats dashboard (same JWT)

## Auth layers
- Clerk (users): session cookie auto-sent; server reads via `getAuth(req)` from `@clerk/express`
- Admin: JWT in localStorage `cc_admin_token`; issued by `POST /api/admin/login` (password only)

## User key flow
- Users self-create up to 5 `sk-cc-*` keys from `/app` → API Keys page
- Keys stored in `user_keys` table with `clerk_user_id` column
- Admin-issued keys have `clerk_user_id = null`; self-created have a Clerk userId
- Full key shown ONCE in modal at creation; thereafter masked

## DB tables (all verified present)
cc_keys, rc_keys, user_keys (+ clerk_user_id col), request_logs, providers, routing_rules
NO sessions table (Clerk handles sessions)

## RC pool status
- Endpoint returns `{ active: number }` (not `hasPoolKeys`)
- Frontend hook maps `active > 0` → `hasPoolKeys`

**Why:** Common gotcha — the wire format is `active` not `hasPoolKeys`.
