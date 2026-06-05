---
name: Smart Routing only — CC/RC key pools removed
description: CC Keys and RC Keys completely removed; all requests go through Smart Routing engine.
---

## What changed
- `key-pool.ts` and `rc-pool.ts` deleted (no longer imported anywhere)
- `cc-keys.tsx` and `rc-keys.tsx` dashboard pages deleted
- `CcKeysPanel` and `RcKeysPanel` removed from `console.tsx`
- All chat routes (`/chat`, `/v1/chat/completions`, `/v1/messages`, `/v1/responses`, proxy endpoints) now call `resolveRoute(ruleName)` to get provider credentials
- Admin stats and logs no longer reference `ccKeyId` in joins
- `/chat/models` returns routing rules (not CC model list)
- `/chat/rc-pool-status` always returns `{ active: 0 }` (kept for backward compat)
- `/chat/rc-models` always returns `{ models: [] }`

## Routing flow
Every request → `resolveRoute(ruleName)` where `ruleName` = model name (strip `route:` prefix if present) → returns Custom provider `{ apiKey, apiBaseUrl, modelId, rpmLimit }` → forward to `{apiBaseUrl}/v1/{endpoint}`.

If no rule found → 404. If all providers rate-limited → 429.

**Why:** Admin panel no longer manages CC/RC key pools. All provider credentials live in Custom Providers + Routing Rules UI in the admin console.

**How to apply:** When adding new endpoints or proxies, always call `resolveRoute(ruleName)` — never fetch from cc_keys or rc_keys tables (those tables still exist in DB but are unused).
