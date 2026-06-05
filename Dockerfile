# ─────────────────────────────────────────────────────────────────────────────
# Stage 1 — Install all workspace dependencies
# ─────────────────────────────────────────────────────────────────────────────
FROM node:24-slim AS deps

RUN npm install -g pnpm@10

WORKDIR /workspace

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY tsconfig.base.json tsconfig.json ./

COPY lib/db/package.json               lib/db/
COPY lib/api-spec/package.json         lib/api-spec/
COPY lib/api-zod/package.json          lib/api-zod/
COPY lib/api-client-react/package.json lib/api-client-react/

COPY artifacts/api-server/package.json artifacts/api-server/
COPY artifacts/chatbot/package.json    artifacts/chatbot/

RUN pnpm install --frozen-lockfile

# ─────────────────────────────────────────────────────────────────────────────
# Stage 2 — Build frontend (React + Vite)
# ─────────────────────────────────────────────────────────────────────────────
FROM deps AS build-frontend

COPY lib/                 lib/
COPY artifacts/chatbot/   artifacts/chatbot/
COPY attached_assets/     attached_assets/

ENV PORT=3000
ENV BASE_PATH=/
ENV NODE_ENV=production

RUN pnpm --filter @workspace/chatbot run build

# ─────────────────────────────────────────────────────────────────────────────
# Stage 3 — Build API server (esbuild bundle)
# ─────────────────────────────────────────────────────────────────────────────
FROM deps AS build-api

COPY lib/              lib/
COPY artifacts/api-server/ artifacts/api-server/

RUN pnpm --filter @workspace/api-server run build

# ─────────────────────────────────────────────────────────────────────────────
# Stage 4 — Production image (tiny, no devDeps)
# ─────────────────────────────────────────────────────────────────────────────
FROM node:24-slim AS production

RUN npm install -g pnpm@10

WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY lib/db/package.json               lib/db/
COPY artifacts/api-server/package.json artifacts/api-server/

RUN pnpm install --frozen-lockfile --prod --filter @workspace/api-server

COPY --from=build-api      /workspace/artifacts/api-server/dist ./dist
COPY --from=build-frontend /workspace/artifacts/chatbot/dist/public ./public
COPY lib/db/src/  lib/db/src/
COPY lib/db/drizzle.config.ts lib/db/

ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://localhost:'+process.env.PORT+'/api/healthz', r => process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "--enable-source-maps", "./dist/index.mjs"]
