# CommandCode API Gateway

منصة AI proxy كاملة بدعم مزودَين: **CommandCode** (CC) و**Right Code** (RC — right.codes). تدعم streaming فوري، 12+ نموذج CC و58+ نموذج RC عبر 7 قنوات. دعم الصور/Vision لجميع المزودين. المستخدمون يسجلون عبر Clerk ويديرون مفاتيحهم من لوحة تحكم خاصة. يشمل **Smart Routing** لتوجيه النماذج ديناميكياً مع fallback تلقائي وتتبع RPM.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — تشغيل API server (port 8080)
- `pnpm --filter @workspace/chatbot run dev` — تشغيل الـ frontend (port 22967)
- `pnpm --filter @workspace/db run push` — تطبيق schema قاعدة البيانات
- `pnpm run typecheck` — فحص TypeScript لكل الحزم
- `pnpm run build` — بناء كل شيء
- `pnpm --filter @workspace/api-spec run codegen` — إعادة توليد API hooks و Zod schemas

## Stack

- pnpm workspaces، Node.js 24، TypeScript 5.9
- API: Express 5 (proxy server → CC + RC)
- Frontend: React + Vite + Tailwind CSS + shadcn/ui
- Auth: Clerk (مستخدمون) + JWT (أدمن)
- DB: PostgreSQL + Drizzle ORM
- Routing: wouter
- Build: esbuild (ESM bundle)

## Where things live

- `lib/api-spec/openapi.yaml` — عقد الـ API (source of truth)
- `lib/db/src/schema/` — Drizzle schemas (providers, cc_keys, rc_keys, user_keys, request_logs, routing_rules)
- `artifacts/api-server/src/routes/chat.ts` — CC + RC proxy routes، vision builders، Claude Code proxy، Codex proxy
- `artifacts/api-server/src/routes/admin.ts` — Admin CRUD: CC keys، RC keys، user keys، providers، logs، routing rules
- `artifacts/api-server/src/routes/user.ts` — User self-service: key CRUD (Clerk-authed)، stats، logs
- `artifacts/api-server/src/lib/routing-engine.ts` — Smart Routing: exact/contains/default matching، rate-limit fallback
- `artifacts/api-server/src/lib/settings.ts` — modelOverrides، adjustUserCredit، getSettings
- `artifacts/api-server/src/lib/user-rate-limiter.ts` — checkUserRpm، getUserRpmUsage per user key
- `artifacts/api-server/src/app.ts` — Express setup، static file serving (production)
- `artifacts/chatbot/src/pages/landing.tsx` — Landing page (`/`، public)
- `artifacts/chatbot/src/pages/user-dashboard.tsx` — **User dashboard** (`/app`، Clerk-protected): 9 pages
- `artifacts/chatbot/src/pages/console.tsx` — Admin API Console (`/taherlt`، password-only)
- `artifacts/chatbot/src/pages/chat.tsx` — Full chatbot UI (`/chat`)
- `artifacts/chatbot/src/pages/dashboard/` — Admin stats dashboard (`/dashboard`، password-only)
- `artifacts/chatbot/src/pages/dashboard/routing.tsx` — Smart Routing rule editor
- `artifacts/chatbot/src/pages/dashboard/providers.tsx` — Custom providers manager
- `artifacts/chatbot/src/hooks/use-chat-stream.ts` — SSE streaming hook، ImageAttachment type
- `artifacts/chatbot/src/context/admin-auth.tsx` — Admin JWT auth context + `useAdminFetch` hook

## Architecture decisions

- Backend proxy: API keys server-side، never exposed to browser
- CommandCode requires custom headers (x-command-code-*) with OS/arch/UUIDs — generated per-request
- Streaming via SSE: frontend uses raw `fetch()` + `ReadableStream`
- CC model list: dynamic from `https://api.commandcode.ai/provider/v1/models`، cached 10 min server-side
- RC model list: dynamic from `https://right.codes/models/public` (public، no auth)، cached 10 min
- Body parser limit: 25MB (base64 image attachments)
- TCP Nagle disabled on SSE (`socket.setNoDelay(true)`) for immediate chunk delivery
- Admin auth: JWT in localStorage (`cc_admin_token`)، issued by `POST /api/admin/login`
- Cost calc: `modelOverrides` lookup tries both `requestedModel` AND `route:${requestedModel}` keys
- Smart Routing: routing rule providers are tried in priority order; rate-limited providers are skipped
- Credits: 1 credit = $0.01 USD; `adjustUserCredit()` in settings.ts handles deduction

## Product

### Routes overview

| Route | Access | Purpose |
|---|---|---|
| `/` | Public | Landing page |
| `/sign-in`, `/sign-up` | Public | Clerk auth pages |
| `/app` | Clerk login | User dashboard — self-service API key management |
| `/chat` | Public | Full chatbot UI (CC + RC streaming) |
| `/taherlt` | `ADMIN_PASSWORD` | Secret admin API console |
| `/dashboard` | `ADMIN_PASSWORD` | Admin stats، CC/RC key pools، logs، routing |

### User Dashboard (`/app`)
- Protected by Clerk; signed-out → redirect to `/sign-in`
- **Home** — 8 stat cards + announcements
- **Dashboard** — range filter + 4 stat cards + rate limits + charts
- **Usage Logs** — paginated table with date/model/status filters
- **API Keys** — create up to 5 `sk-cc-*` keys; full key shown once; toggle/delete
- **Models** — all CC + RC models by channel
- **Subscribe** — balance top-up + package plans
- **Invite & Earn** — referral code + link
- **Contact** — support links
- **Claude Code** — instructions + config with user's own sk-cc-* key
- **Codex CLI** — instructions + config

### Admin API Console (`/taherlt`)
- 3-column: sidebar nav | main content | compact test chat
- Password-only auth; JWT in localStorage
- Manages: Providers، API Keys، CC Keys pool، RC Keys pool

### Admin Dashboard (`/dashboard`)
- Login with `ADMIN_PASSWORD`
- **Overview** — requests today/week/total، active keys، top models
- **CC Keys** — add/remove/test/enable CC keys
- **RC Keys** — add/remove RC keys
- **User Keys** — view all user keys; "self-created" badge
- **Logs** — full paginated request log
- **Smart Routing** — create/edit/delete routing rules with provider chain + inline API key/URL

## Architecture (dual-provider + Smart Routing)

```
User (Clerk)  → /app  → GET /api/user/keys (create/manage own sk-cc-* keys)
User          → X-Api-Key: sk-cc-* → POST /api/chat/stream → CC or RC upstream
[CC mode]     → Round-Robin CC Key Pool → CommandCode API
[RC mode]     → right.codes/{channel}/v1/...

Claude Code   → ANTHROPIC_BASE_URL=/api/proxy/claude → /api/proxy/claude/v1/messages
                → Smart Routing (claude-opus-4-8 rule) → upstream Anthropic/RC

Codex CLI     → OPENAI_BASE_URL=/api/proxy/codex → /api/proxy/codex/v1/*
                → Smart Routing (gpt-5.x rules) → upstream OpenAI/RC

Admin         → ADMIN_PASSWORD → /taherlt (console) + /dashboard (stats + routing)
```

### Right Code channels

| Channel prefix | API type | Endpoint |
|---|---|---|
| `/codex-pro` | OpenAI completions | `right.codes/codex-pro/v1/chat/completions` |
| `/codex` | OpenAI responses | `right.codes/codex/v1/responses` |
| `/deepseek` | OpenAI completions | `right.codes/deepseek/v1/chat/completions` |
| `/claude` | Anthropic messages | `right.codes/claude/v1/messages` |
| `/claude-aws` | Anthropic messages | `right.codes/claude-aws/v1/messages` |
| `/deepseek/anthropic` | Anthropic messages | `right.codes/deepseek/anthropic/v1/messages` |
| `/gemini` | Gemini native | `right.codes/gemini/rbeta/models/{m}:streamGenerateContent` |

RC model IDs: `rc:{prefix}|{modelName}` — e.g. `rc:/codex-pro|gpt-5.4`

### Smart Routing

- قواعد توجيه في DB (`routing_rules` table) — محفوظة كـ JSONB
- كل قاعدة: اسم، قائمة مزودين (priority)، سعر input/output per 1M tokens
- Matching: exact name → partial (contains) → `_default` fallback
- Provider types: `cc` (CC pool)، `rc` (RC pool)، `custom` (inline API key + base URL)
- RPM per provider: إذا تجاوز الحد يُتخطى إلى التالي
- الـ API key في القاعدة يأتي من: localStorage pool keys (provider مُختار) أو حقل مباشر (custom بدون provider)

### CC key pool
- User → `X-Api-Key: sk-cc-<hex>` → validated against `user_keys` DB
- Server picks CC key round-robin from `cc_keys` (active + valid)
- Each request logged to `request_logs`
- If CC key returns 401/403 → auto-marked invalid
- Fallback: env `COMMANDCODE_API_KEY`

### RC key pool
- RC keys in `rc_keys` DB (active/inactive)
- `GET /api/chat/rc-pool-status` → `{ active: number }`
- User can also supply own RC key (localStorage)

## Database schema

| Table | Purpose |
|---|---|
| `cc_keys` | CommandCode API key pool (round-robin) |
| `rc_keys` | Right Code API key pool |
| `user_keys` | `sk-cc-*` keys — user self-created (has `clerk_user_id`) or admin-issued |
| `request_logs` | All chat requests (model، elapsed، key، status، cost) |
| `providers` | Custom AI providers (name، slug، type، baseUrl، authMethod، channels) |
| `routing_rules` | Dynamic routing rules (providers JSONB، prices، isActive) |

## Image / Vision Support

Client-side compression before upload:

| Parameter | Value |
|---|---|
| Max dimensions | 1024 × 1024 px |
| Output format | JPEG |
| JPEG quality | 82% |

| Provider | Vision format |
|---|---|
| Anthropic (`/claude`، `/claude-aws`) | `source: { type: "base64", media_type, data }` |
| OpenAI completions | `image_url: { url: "data:…;base64,…" }` |
| OpenAI responses | `image_url: { url: "data:…;base64,…" }` |
| Gemini | `inlineData: { mimeType, data }` |

## Proxy Endpoints

| Endpoint | Tool | Config |
|---|---|---|
| `POST /api/proxy/claude/v1/messages` | Claude Code | `ANTHROPIC_BASE_URL=.../api/proxy/claude` |
| `GET  /api/proxy/claude/v1/models` | Claude Code | يُرجع نماذج claude-opus-4-8، claude-opus-4-5... |
| `POST /api/proxy/codex/v1/chat/completions` | Codex CLI (completions) | `OPENAI_BASE_URL=.../api/proxy/codex` |
| `POST /api/proxy/codex/v1/responses` | Codex CLI (responses) | `OPENAI_BASE_URL=.../api/proxy/codex` |
| `GET  /api/proxy/codex/v1/models` | Codex CLI | يُرجع قائمة نماذج GPT |
| `GET  /api/healthz` | Health check | `{"status":"ok"}` |

## Gotchas

- CC model IDs are **case-sensitive**
- RC `/v1/models` returns 404 — correct endpoint: `/models/public`
- RC `/codex` channel: `/v1/responses` format only (NOT `/v1/chat/completions`)
- RC `/claude` requires Claude Code fingerprint headers — applied automatically server-side
- Cost lookup: tries `requestedModel` then `route:${requestedModel}` in modelOverrides
- `claude-opus-4-8` routing rule needs API Key + Base URL configured in Smart Routing
- Streaming (SSE) requires Nginx `proxy_buffering off` in production
- Body parser limit: 25MB — increase in `app.ts` if needed for larger images

## Fixes Log (chronological)

| الإصلاح | الملف |
|---------|-------|
| Cost calculation: فحص `route:X` + `X` في modelOverrides | `settings.ts` |
| RPM counter: إضافة `checkUserRpm` لـ `handleCodexResponses` | `chat.ts` |
| CustomProviderKeyPanel: دعم مفاتيح متعددة + labels + model fetch + Base URL | `console.tsx` |
| API key copy: `GET /api/user/keys` يُرجع `key` (full) + `maskedKey` | `user.ts`، `user-dashboard.tsx` |
| Claude Code proxy: `/api/proxy/claude/v1/messages` handler كامل | `chat.ts` |
| Routing Rule editor: حقول API Key + Base URL مباشرة (custom بدون provider) | `routing.tsx` |
| Static models list: إضافة `claude-opus-4-8` | `chat.ts` |

## Google Cloud Run Deployment

See `DEPLOYMENT.md` for full VPS + Cloud Run + manual deployment instructions.

### One-time GCP setup (quick reference)

```bash
gcloud services enable run.googleapis.com cloudbuild.googleapis.com \
  artifactregistry.googleapis.com secretmanager.googleapis.com

gcloud artifacts repositories create cloud-run-source-deploy \
  --repository-format=docker --location=me-central1

# Create secrets
echo -n "VALUE" | gcloud secrets create database-url           --data-file=-
echo -n "VALUE" | gcloud secrets create admin-password         --data-file=-
echo -n "VALUE" | gcloud secrets create session-secret         --data-file=-
echo -n "VALUE" | gcloud secrets create clerk-publishable-key  --data-file=-
echo -n "VALUE" | gcloud secrets create clerk-secret-key       --data-file=-

# Grant Cloud Build access
PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format='value(projectNumber)')
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$PROJECT_NUMBER@cloudbuild.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

### Manual deploy

```bash
gcloud builds submit --config cloudbuild.yaml \
  --substitutions _SERVICE_NAME=commandcode,_REGION=me-central1
```

## User preferences

- User uses Arabic; app supports Arabic text input with RTL detection
