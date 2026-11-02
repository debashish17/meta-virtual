# DEPLOY.md — Virtual Office hosting (P3-D smoke test)

Web host: **Vercel** (static `apps/web/dist`). Server host: **Fly.io** (one
long-lived container: Colyseus room + HTTP API). Owner decision D3.

This page lets the lead deploy blind the moment `FLY_API_TOKEN` and
`VERCEL_TOKEN` exist. No secret is ever written here or in the repo — only
names and where each value comes from.

> Scope: the P3-D **smoke test** (`AUTH_MODE=dev` on the server,
> `VITE_AUTH_MODE=dev` + `VITE_API=mock` on the web). It proves a public URL
> reaches the deployed server (Gate G3). Production env (`AUTH_MODE=supabase`,
> the hosted Supabase project) is P4-A, which reuses these files with the env
> changes noted below.

## 0. Prerequisites

- `flyctl` and `vercel` CLIs installed, and the two tokens exported. The tokens
  live only in the lead's shell / CI secrets — never in chat, logs, or git:
  - `FLY_API_TOKEN` — from the Fly.io dashboard (owner's account, D3).
  - `VERCEL_TOKEN` — from the Vercel dashboard (owner's account, D3).
- From the repo root, on `main` with the P3-D files merged.

## 1. Server → Fly.io

Config: [fly.toml](../fly.toml), [Dockerfile](../apps/server/Dockerfile).
Build context is the **repo root**. `PORT` comes from the host
(`fly.toml` sets `8080`; the server reads `process.env.PORT`).

### 1.1 First deploy

```bash
# From the repo root. Log in (interactive, once per machine):
fly auth login

# Create the app (once). The name must be globally unique; then put the
# same name in fly.toml `app = "..."` and commit it.
fly apps create virtual-office-smoke --org <org-from-dashboard>

# Deploy, stamping the commit into /health:
fly deploy --build-arg GIT_COMMIT=$(git rev-parse --short HEAD)

# Read the public URL:
fly status
# → https://virtual-office-smoke.fly.dev (or the name you chose)
```

### 1.2 Verify

```bash
# Health reports the deployed commit, auth mode and LLM (nothing secret):
curl -s https://<server-host>/health
# → {"ok":true,"version":"<short-sha>","authMode":"dev","llm":"fixture"}

# Logs (check the listen line, no env values are printed):
fly logs
# → [server] office listening on :8080 (auth=dev)

# WebSocket join works (from the repo root; any name after `dev:`):
node --input-type=module -e "
import('@colyseus/sdk').then(async ({ Client }) => {
  const client = new Client('wss://<server-host>');
  client.auth.token = 'dev:Maya';
  const room = await client.joinOrCreate('office', { protocol: 1,
    displayName: 'Maya', workspaceId: 'northwind-demo',
    look: { body: 'casual', top: '#f2f2ef', accent: '#f2f2ef',
      bottom: '#34495e', shoes: '#24262a', height: 1.68 } });
  console.log('JOIN_OK', room.sessionId);
  await room.leave(); process.exit(0);
});"
```

### 1.3 After the web deploy (step 2)

Once the Vercel URL exists (step 2.2), lock CORS to it and redeploy:

```bash
# In fly.toml set: ALLOWED_ORIGINS = "https://<vercel-host>"
fly deploy --build-arg GIT_COMMIT=$(git rev-parse --short HEAD)
```

Until then `ALLOWED_ORIGINS` is empty and the server answers `*` (smoke only).

### 1.4 Server env table

Set in `fly.toml [env]` (non-secret, needs a redeploy to change) or with
`fly secrets set NAME=value` (secret, restarts the machine). Smoke values:

| Var | Where | Smoke value (source) |
|---|---|---|
| `PORT` | `[env]` | `8080` (must equal `http_service.internal_port`) |
| `AUTH_MODE` | `[env]` | `dev` (smoke only; P4-A: `supabase`) |
| `ALLOWED_ORIGINS` | `[env]` | `""` first, then the Vercel URL (step 1.3) |
| `GIT_COMMIT` | `--build-arg` | `$(git rev-parse --short HEAD)` at deploy time |
| `NODE_ENV` | unset | Leave unset for the smoke: `production` refuses `AUTH_MODE=dev`. P4-A sets it with `supabase` mode |

Not used by the smoke test (P4-A): `DATABASE_URL`, `SUPABASE_URL`,
`SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWKS_URL`,
`LLM_PROVIDER`, `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL` — all via
`fly secrets set` when P4-A needs them. Without a key the server runs
`FixtureLlm` and says so on `/health` (`"llm":"fixture"`).

### 1.5 Rollback / decommission

```bash
# Roll back to the previous release:
fly releases --app <app-name>     # pick the version
fly deploy --build-arg GIT_COMMIT=<previous-sha>   # redeploy that commit
# (or: git checkout <previous-sha> -- . && fly deploy, then restore)

# Stop paying / tear down the smoke app:
fly apps destroy <app-name>       # asks for confirmation; deletes everything
```

## 2. Web → Vercel

Config: [vercel.json](../apps/web/vercel.json). The Vercel project's **Root
Directory is `apps/web`**; the install/build commands climb to the repo root
for the pnpm workspace. Output is `apps/web/dist`. All `VITE_*` vars are
baked in **at build time** — changing one needs a redeploy.

### 2.1 First deploy

```bash
# From apps/web. Log in (interactive, once per machine):
cd apps/web
vercel login

# Link (once): Root Directory = apps/web, Framework Preset = Vite.
vercel link

# Set the smoke env (build-time; values from the table below):
vercel env add VITE_SERVER_URL production
vercel env add VITE_AUTH_MODE production
vercel env add VITE_API production

# Deploy:
vercel --prod
# → https://<project>.vercel.app
```

Non-interactive (with `VERCEL_TOKEN` exported):

```bash
cd apps/web
vercel pull --yes --environment=production --token="$VERCEL_TOKEN"
vercel build --yes --token="$VERCEL_TOKEN"
vercel deploy --prebuilt --prod --token="$VERCEL_TOKEN"
```

### 2.2 Verify

- Open `https://<project>.vercel.app` in **two browsers**: each picks a name,
  both see each other's name pill, one walks and the other sees it move
  (Gate G3). This is the P3-D acceptance.
- `https://<project>.vercel.app/assets/catalogue/review.html` still serves
  (the SPA rewrite excludes `/assets/`).
- Then do step 1.3 so the server's CORS names this URL.

### 2.3 Web env table (all build-time, all non-secret)

| Var | Smoke value (source) |
|---|---|
| `VITE_SERVER_URL` | `https://<server-host>` from step 1.1 (the SDK upgrades to WebSocket itself; plain `https://`, no `/ws` suffix) |
| `VITE_AUTH_MODE` | `dev` (smoke only: the name picker, no network. P4-A: `supabase`) |
| `VITE_API` | `mock` (smoke only: panels read the in-memory demo data. P4-A: `http`) |

Not used by the smoke test (P4-A): `VITE_SUPABASE_URL`,
`VITE_SUPABASE_ANON_KEY` (from the hosted Supabase project's API settings).

### 2.4 Rollback / decommission

- Roll back: Vercel dashboard → project → Deployments → the previous
  production deployment → "Promote to Production". Or redeploy the previous
  commit: `git checkout <sha> -- apps/web && vercel --prod` from `apps/web`,
  then restore.
- Decommission: Vercel dashboard → project → Settings → Delete Project
  (or `vercel remove <project> --yes --token="$VERCEL_TOKEN"`).

## 3. Local proof without tokens (what P3-D verified)

No host credentials needed; this is the config-scope acceptance:

```bash
# Server image builds, runs, and answers /health with the stamped commit:
docker build -f apps/server/Dockerfile \
  --build-arg GIT_COMMIT=$(git rev-parse --short HEAD) -t office-server:smoke .
docker run -d --rm --name office-smoke -p 2568:8080 \
  -e PORT=8080 -e AUTH_MODE=dev office-server:smoke
curl -s http://localhost:2568/health
# → {"ok":true,"version":"<short-sha>","authMode":"dev","llm":"fixture"}
docker stop office-smoke   # container is --rm, nothing left behind

# Web app builds with the smoke env (tsc + vite):
cd apps/web
VITE_SERVER_URL=https://<server-host> VITE_AUTH_MODE=dev VITE_API=mock pnpm build
```

`vercel build` was tried first but this CLI version requires login even to
build, so the recorded web proof is the `vite build` above (same commands
`vercel.json` runs remotely) plus a JSON parse of `vercel.json`.

## 4. From smoke to production (P4-A checklist)

- Server: `AUTH_MODE=supabase`, `NODE_ENV=production`,
  `ALLOWED_ORIGINS=https://<prod-web>`, plus `DATABASE_URL`, `SUPABASE_*`,
  `LLM_*` via `fly secrets set` (never in `fly.toml`).
- Web: `VITE_AUTH_MODE=supabase`, `VITE_API=http`,
  `VITE_SERVER_URL=https://<prod-server>`, `VITE_SUPABASE_URL`,
  `VITE_SUPABASE_ANON_KEY`; redeploy so the build picks them up.
- Re-run sections 1.2 and 2.2 against the production URLs.
