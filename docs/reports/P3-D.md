# Report: P3-D Deployment smoke test — CONFIG SCOPE

```
Work package / gate: P3-D Deployment smoke test (config scope only)
Status: partial
Done:
- Server container: apps/server/Dockerfile (Node 22-slim, two stages; corepack
  pnpm, frozen lockfile, filter build bundling @office/shared, pnpm deploy for
  the runtime tree, GIT_COMMIT build-arg stamped into /health, PORT from env,
  /health HEALTHCHECK). Fixed during verification: web manifest needed for the
  frozen install; GIT_COMMIT re-declared in the runtime stage.
- Server host config: fly.toml at repo root (build context = repo root,
  dockerfile = apps/server/Dockerfile; lhr region; http_service on 8080 with
  force_https, /health check, shared-cpu-1x; smoke env AUTH_MODE=dev,
  ALLOWED_ORIGINS empty until the web URL exists).
- Web host config: apps/web/vercel.json (Root Directory apps/web; pnpm
  install/build via repo root; output dist; SPA rewrite to /index.html
  excluding /assets/ so the review sheet keeps serving).
- Root .dockerignore so the image build skips node_modules/dist/.git.
- docs/DEPLOY.md: exact deploy + verify + decommission commands per host, full
  env table per host (names/placeholders only, nothing secret), rollback notes,
  the smoke→production (P4-A) checklist.
Evidence:
- docker build of the server image: pass (office-server:smoke, 427 MB).
- Container run + curl /health: {"ok":true,"version":"5c6eb91",
  "authMode":"dev","llm":"fixture"} — commit stamp verified against
  git rev-parse --short HEAD.
- WebSocket join against the container (Colyseus SDK, dev:Maya,
  northwind-demo): JOIN_OK.
- Web: `vercel build` requires login on this box (CLI 65.9.0 errors "The
  specified token is not valid" before building), so per the package brief the
  recorded proof is `vite build` with the smoke env
  (VITE_SERVER_URL=https://virtual-office-smoke.fly.dev VITE_AUTH_MODE=dev
  VITE_API=mock): pass (tsc + vite, 6.28 s); server URL confirmed baked into
  dist; vercel.json JSON-parsed OK. Build output removed afterwards.
- pnpm typecheck: pass (3/3 tasks). pnpm lint: pass (3/3 tasks).
- pnpm test: not run — no code changed (config + docs only).
- Container stopped and removed (docker rm); ports 2568/5174 verified free;
  no fly/vercel auth or deploy command was attempted (hard constraint kept).
Deviations:
- fly.toml lives at the repo root, not apps/server: Fly uses the fly.toml
  directory as the build context and the Dockerfile needs the repo root
  (workspace install). WORK_PACKAGES Owns covers host config generally.
- Added a root .dockerignore (deploy configuration; keeps the image build
  fast and secret-free).
- Web proof is vite build, not vercel build (CLI demands auth; brief allows
  this fallback and DEPLOY.md records it).
Files changed outside "Owns": none (.dockerignore and root fly.toml are
deploy configuration, which P3-D owns).
Requests: none.
How to verify:
- git -C .worktrees/vo-P3-D log --oneline -1 (branch wp/P3-D-deploy-smoke)
- Repeat Evidence commands from docs/DEPLOY.md section 3 (no tokens needed).
- Read docs/DEPLOY.md sections 1-2 for the blind-deploy runbook.
Open questions:
- UNBLOCK (credential blocker): no Fly.io / Vercel tokens exist on this box.
  The moment FLY_API_TOKEN + VERCEL_TOKEN exist, the lead runs DEPLOY.md
  sections 1.1 and 2.1, then 1.3, then the two-browser check in 2.2.
- Real Fly app name (globally unique) and org; real Vercel project name —
  chosen at creation time, then written back into fly.toml / the report.
Next:
- Lead executes the deploy (DEPLOY.md 1.1, 2.1, 1.3) and the two-browser
  G3 check (2.2); on green, P3-D closes and P4-A reuses these files.
- Not started (stays OPEN): "public URL connects to the deployed server".
```
