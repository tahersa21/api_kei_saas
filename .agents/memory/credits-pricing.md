---
name: Credits and pricing system
description: How credits, pricing, and cost deduction work in CommandCode
---

## Credit system
- Credits stored in `settings.json` via `adjustUserCredit()` in `artifacts/api-server/src/lib/settings.ts`
- 1 credit = $0.01 USD
- `getUserCredit(clerkUserId)` reads balance; `adjustUserCredit(clerkUserId, delta, note)` updates it
- Balance exposed to users via `GET /api/user/credits`

## Pricing setup
- Prices set per routing rule in the DB: `routing_rules.price_input_per1m` and `routing_rules.price_output_per1m` (real, USD per 1M tokens, nullable = free)
- Admin sets prices via Smart Routing page editor (Input/Output price fields per rule)
- `resolveRoute()` in routing-engine.ts now includes `priceInputPer1M`/`priceOutputPer1M` in the `ResolvedRoute` return type

## Cost calculation (in handleCodexResponses, chat.ts)
- After SSE stream ends, tokens parsed → `costUsd = (tokensIn * priceIn + tokensOut * priceOut) / 1_000_000`
- `costCredits = Math.round(costUsd * 100)`
- Stored in `request_logs.cost_credits` (integer column)
- Credit deducted: `adjustUserCredit(clerkUserId, -costCredits, note)` — only if price is set and tokens > 0
- `clerkUserId` is captured from the `user_keys` row lookup at request start

## User-facing display
- Usage Logs table: shows Tokens (in↑/out↓) and Cost columns per request
- Dashboard "Total Cost" stat: sums `cost_credits` from request_logs
- Models page routing tab: shows input/output price if set on the rule

**Why:**
Pricing at the routing-rule level (not provider entry) keeps it simple — one price per logical model name, regardless of which backend provider handles it. Credits deducted in fire-and-forget fashion after stream completes.
