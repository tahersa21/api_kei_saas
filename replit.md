# CommandCode Chatbot

A professional AI management console with dual-provider support: **CommandCode** (CC) and **Right Code** (RC — right.codes). Supports real-time streaming responses with 12+ CC models and 58+ RC models across 7 channels. Supports image/vision attachments for all providers.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/chatbot run dev` — run the frontend (port 22967)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5 (proxy server to CommandCode + Right Code)
- Frontend: React + Vite + Tailwind CSS + shadcn/ui
- Routing: wouter
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `lib/api-spec/openapi.yaml` — API contract (source of truth)
- `lib/db/src/schema/` — Drizzle DB schemas (providers, cc_keys, user_keys, request_logs)
- `artifacts/api-server/src/routes/chat.ts` — CC + RC proxy routes (streaming SSE), vision builders
- `artifacts/api-server/src/routes/admin.ts` — Admin CRUD: CC keys, user keys, providers, logs, overview
- `artifacts/api-server/src/app.ts` — Express app setup (body parser limit: 25MB)
- `artifacts/chatbot/src/pages/console.tsx` — **Main page** (`/`): API Console with sidebar, provider/key management, test chat
- `artifacts/chatbot/src/pages/chat.tsx` — Full chatbot UI (`/chat`)
- `artifacts/chatbot/src/pages/dashboard/` — Admin dashboard (`/dashboard`)
- `artifacts/chatbot/src/hooks/use-chat-stream.ts` — SSE streaming hook, ImageAttachment type
- `artifacts/chatbot/src/hooks/use-rightcode-key.ts` — RC key localStorage hook
- `artifacts/chatbot/src/hooks/use-rc-pool-status.ts` — RC server pool status hook
- `artifacts/chatbot/src/context/admin-auth.tsx` — Admin JWT auth context + `useAdminFetch` hook

## Architecture decisions

- Backend proxy pattern: API keys stored server-side, never exposed to browser
- CommandCode requires custom headers (x-command-code-*) with OS/arch/UUIDs — generated per-request
- Streaming via SSE (Server-Sent Events): frontend uses raw fetch() with ReadableStream
- CC model list: dynamic from `https://api.commandcode.ai/provider/v1/models`, cached 10 min server-side
- RC model list: dynamic from `https://right.codes/models/public` (public, no auth), cached 10 min server-side
- System prompt is separate from messages array (CC API requirement)
- Body parser limit: 25MB (to accommodate base64-encoded image attachments)
- TCP Nagle disabled on SSE connections (`socket.setNoDelay(true)`) for immediate chunk delivery
- Elapsed time timer measures API response time only (stops when last token arrives, before typewriter animation)
- Admin auth: JWT token in localStorage (`cc_admin_token`), issued by `POST /api/admin/login`
- RC pool status: `GET /api/chat/rc-pool-status` — returns `{ hasPoolKeys: boolean }`

## Product

### API Console (`/`) — Main page
- 3-column layout: sidebar nav | main content | compact test chat panel (always visible)
- **Admin unlock**: lock icon in header opens login dialog; features gated behind JWT auth
- Lock banner at top when not authenticated

**Sidebar sections:**
- **Providers** — built-in CC + RC cards, custom providers from DB (type: text/video/audio); add/toggle/delete
- **API Keys** — create `sk-cc-*` user keys for external websites; copy key + integration snippet
- **CC Keys** — add/remove/test/enable CommandCode API keys (server pool)
- **RC Keys** — add/remove Right Code API keys (server pool)
- **Logs** — link to `/dashboard` logs page

**Test Chat panel (right side):**
- CC/RC toggle + model selector grouped by channel/family
- Streaming messages with typewriter animation
- Inline error display with Claude Official → AWS warning
- RC key status indicator (user key / server pool / no key)

### Chatbot (`/chat`) — Full chat UI
- Real-time AI chat with streaming responses
- **[CC] / [RC] provider toggle** in header
- **CC mode**: 12+ open-source models (DeepSeek, GLM, Kimi, Qwen, etc.)
- **RC mode**: 58 models across 7 channels (GPT-5.x Codex, Claude, Gemini, DeepSeek)
- Model selector grouped by channel/family
- Collapsible system prompt configuration
- RTL support for Arabic text
- Stop streaming mid-response
- **Image/media upload** — paperclip button; client-side compression before upload

### Admin Dashboard (`/dashboard`)
- Login protected with `ADMIN_PASSWORD` env var
- **Overview** — requests today/week/total, active keys, top models chart
- **CC Keys** — add/remove/test/enable CommandCode API keys (pool)
- **User Keys** — create/revoke `sk-cc-*` keys to issue to users
- **Logs** — full paginated request log with status/duration/key labels

## User preferences

- User uses Arabic; app supports Arabic text input with RTL detection

## Architecture (dual-provider)

```
[CC mode]  User → POST /api/chat/stream → Round-Robin CC Key Pool → CommandCode API
[RC mode]  User → [RC key header] → POST /api/chat/stream → right.codes/{channel}/v1/...
Admin      → [ADMIN_PASSWORD] → /dashboard → manage CC keys, user keys, logs
Console    → [ADMIN_PASSWORD] → / → manage providers, API keys, CC/RC key pools
```

### Right Code channels & routing

| Channel prefix | API type | Endpoint |
|---|---|---|
| `/codex-pro` | OpenAI completions | `right.codes/codex-pro/v1/chat/completions` |
| `/codex` | OpenAI responses | `right.codes/codex/v1/responses` |
| `/deepseek` | OpenAI completions | `right.codes/deepseek/v1/chat/completions` |
| `/claude` | Anthropic messages | `right.codes/claude/v1/messages` |
| `/claude-aws` | Anthropic messages | `right.codes/claude-aws/v1/messages` |
| `/deepseek/anthropic` | Anthropic messages | `right.codes/deepseek/anthropic/v1/messages` |
| `/gemini` | Gemini native | `right.codes/gemini/rbeta/models/{m}:streamGenerateContent` |

RC model IDs are encoded as `rc:{prefix}|{modelName}` — e.g. `rc:/codex-pro|gpt-5.4`

### CC key pool
- User sends `X-Api-Key: sk-cc-<hex>` → validated against `user_keys` DB table
- Server picks next CC key via round-robin from `cc_keys` table (active + valid)
- Each request logged to `request_logs` with elapsed time, model, user key, CC key
- If CC key returns 401/403 it's auto-marked invalid
- Falls back to env `COMMANDCODE_API_KEY` if no DB keys configured

### RC key pool
- RC keys stored in `rc_keys` DB table (active/inactive)
- `GET /api/chat/rc-pool-status` returns `{ hasPoolKeys: boolean }` — used by frontend to show "server key active"
- User can also supply their own RC key via settings (stored in localStorage)

## Database schema

| Table | Purpose |
|---|---|
| `cc_keys` | CommandCode API key pool (round-robin) |
| `rc_keys` | Right Code API key pool |
| `user_keys` | Issued `sk-cc-*` keys for external users |
| `request_logs` | All chat requests (model, elapsed, key used, status) |
| `providers` | Custom AI providers (name, slug, type, baseUrl, authMethod, channels, notes) |
| `sessions` | Express session store |

`providers.type` values: `text` | `video` | `audio`

## Image / Vision Support

Images are attached via the paperclip button. Before sending, they are **compressed client-side** (canvas resize + JPEG re-encode) to reduce payload size:

| Parameter | Value |
|---|---|
| Max dimensions | 1024 × 1024 px |
| Output format | JPEG |
| JPEG quality | 82% |
| Typical size reduction | ~2MB → ~150KB |

The server converts image data to the correct format per provider:

| Provider / API type | Vision format |
|---|---|
| Anthropic (`/claude`, `/claude-aws`, `/deepseek/anthropic`) | `source: { type: "base64", media_type, data }` |
| OpenAI completions (`/codex-pro`, `/deepseek`) | `image_url: { url: "data:…;base64,…" }` |
| OpenAI responses (`/codex`) | `image_url: { url: "data:…;base64,…" }` |
| Gemini (`/gemini`) | `inlineData: { mimeType, data }` |

Wire format in the request body: each message may carry `images?: { data: string, mimeType: string }[]` (base64 without data-URL prefix).

## Gotchas

- CC model IDs are **case-sensitive** — must match exactly as returned by `/provider/v1/models`
- Non-deepseek CC models require the `x-oss-primary-provider` header set to the org prefix
- `/provider/v1/chat/completions` requires Pro plan; only `/alpha/generate` works on individual-go
- RC `/codex` channel only supports `/v1/responses` format — NOT compatible with `/v1/chat/completions`
- RC `/v1/models` returns 404 — correct endpoint is `/models/public` (public, no auth needed)
- NDJSON stream format for CC: `{"type":"text-delta","text":"..."}` for content, `{"type":"reasoning-delta"}` for thinking
- RC `/claude` Official channel requires Claude Code CLI fingerprint headers (`user-agent: claude-code/1.9.7`, stainless SDK headers, `x-claude-code-disable-nonessential-traffic: 1`) — applied automatically server-side for the `/claude` prefix only
- Image requests are inherently slower than text (model processes pixel data); use vision-capable models (Claude Sonnet/Opus, GPT-4o/5, Gemini Pro Vision)
- SSE error format: errors arrive as `data: {"type":"error","error":"..."}` — frontend parses `chunk.error` (string or `{message}` object)

## Google Cloud Run Deployment

The project ships with a production-ready `Dockerfile` and `cloudbuild.yaml`. A single container serves both the API and the frontend.

### Container architecture

```
/app/
  dist/          ← esbuild bundle of the Express API server
  public/        ← Vite-built React frontend (served as static files by Express)
```

### One-time GCP setup

```bash
# 1. Enable required APIs
gcloud services enable run.googleapis.com cloudbuild.googleapis.com \
  artifactregistry.googleapis.com secretmanager.googleapis.com

# 2. Create Artifact Registry repo
gcloud artifacts repositories create cloud-run-source-deploy \
  --repository-format=docker --location=me-central1

# 3. Create secrets
echo -n "VALUE" | gcloud secrets create commandcode-api-key --data-file=-
echo -n "VALUE" | gcloud secrets create session-secret      --data-file=-
echo -n "VALUE" | gcloud secrets create admin-password      --data-file=-
echo -n "VALUE" | gcloud secrets create database-url        --data-file=-

# 4. Grant Cloud Build access to secrets
PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format='value(projectNumber)')
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$PROJECT_NUMBER@cloudbuild.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

### Deploy manually

```bash
gcloud builds submit --config cloudbuild.yaml \
  --substitutions _SERVICE_NAME=commandcode-chatbot,_REGION=me-central1
```

### Automatic CI/CD (GitHub trigger)

Create a Cloud Build trigger pointing to `tahersa21/commandcode_api_key`, branch `main`, config file `cloudbuild.yaml`. Every push to `main` triggers a build + deploy automatically.

### Environment variables required at runtime

| Secret Manager key | Purpose |
|---|---|
| `commandcode-api-key` | CommandCode API key pool fallback |
| `session-secret` | Express session signing key |
| `admin-password` | Dashboard login password |
| `database-url` | PostgreSQL connection string (Cloud SQL or external) |

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
