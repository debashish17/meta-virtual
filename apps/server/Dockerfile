# Virtual Office server (Colyseus room + HTTP API, one Node process).
# Build context is the REPO ROOT (see fly.toml [build] / DEPLOY.md):
#   docker build -f apps/server/Dockerfile \
#     --build-arg GIT_COMMIT=$(git rev-parse --short HEAD) -t office-server:smoke .
# Run smoke: docker run --rm -p 2568:8080 -e PORT=8080 -e AUTH_MODE=dev office-server:smoke

FROM node:22-slim AS build

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /app

# Workspace manifests first so dependency layers cache across code changes.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/server/package.json ./apps/server/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY packages/shared/package.json ./packages/shared/package.json
RUN pnpm install --frozen-lockfile

# The build itself (ARCHITECTURE.md 12.7). tsup bundles @office/shared in.
COPY . .
ARG GIT_COMMIT=""
ENV GIT_COMMIT=${GIT_COMMIT}
RUN pnpm --filter @office/server build

# A self-contained production tree for the server only (no devDeps, no web deps).
RUN pnpm --filter @office/server --prod deploy /prod

FROM node:22-slim AS runtime

# Do NOT set NODE_ENV=production here: the P3-D smoke test runs AUTH_MODE=dev,
# which the server refuses under production (env.ts). P4-A sets NODE_ENV at the
# host when it switches to AUTH_MODE=supabase. Fly also injects PORT itself.
WORKDIR /srv
# Re-declare the build arg: ENV does not cross stage boundaries on its own.
ARG GIT_COMMIT=""
ENV GIT_COMMIT=${GIT_COMMIT}
COPY --from=build /prod/node_modules ./node_modules
COPY --from=build /app/apps/server/dist ./dist
# dist/index.js resolves ../package.json for the /health version fallback.
COPY --from=build /app/apps/server/package.json ./package.json

ENV PORT=8080
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||'8080')+'/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "dist/index.js"]
