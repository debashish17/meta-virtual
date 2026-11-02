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

## Reviewer addendum (2026-11-02, config scope)

Re-read in full: `apps/server/Dockerfile`, `fly.toml`, `apps/web/vercel.json`,
`docs/DEPLOY.md`, `.dockerignore`. Re-ran both local proofs fresh; did not
attempt any deploy/auth command.

Checks re-run (review image `office-server:review`, since removed):
- `docker build -f apps/server/Dockerfile --build-arg
  GIT_COMMIT=$(git rev-parse --short HEAD) -t office-server:review .`: pass.
- `docker run -p 2569:8080 -e PORT=8080 -e AUTH_MODE=dev` + `curl
  /health`: `{"ok":true,"version":"e8f43e7","authMode":"dev","llm":"fixture"}`,
  stamp matches `git rev-parse --short HEAD` (e8f43e7): pass.
- Colyseus SDK join vs the container (dev:Reviewer, northwind-demo,
  protocol 1): JOIN_OK: pass.
- `VITE_SERVER_URL=https://virtual-office-smoke.fly.dev VITE_AUTH_MODE=dev
  VITE_API=mock pnpm build` in apps/web: pass (6.31 s); server URL confirmed
  baked into dist bundle; dist removed afterwards: pass.
- `vercel.json` JSON-parses OK: pass.
- Secret scan over all six touched files (tokens, keys, secret assignments):
  none found: pass.
- `git diff --name-only fde2327..HEAD`: exactly `.dockerignore`,
  `apps/server/Dockerfile`, `apps/web/vercel.json`, `docs/DEPLOY.md`,
  `docs/reports/P3-D.md`, `fly.toml` — all deploy configuration + report:
  pass. No code, lockfile, or env file touched.
- `git log fde2327..HEAD`: 2 commits (config, report); no deploy was
  attempted; task 3 honestly OPEN with unblock steps in report + DEPLOY.md
  1.1/2.1/1.3/2.2: pass.
- Container stopped/removed, image removed, port 2569 verified free
  (`ss` shows nothing): pass.

Verdict per item:
- Task 1 Dockerfile: PASS — Node 22-slim two-stage, corepack pnpm, frozen
  lockfile, `pnpm --filter @office/server build` (tsup bundles
  @office/shared), `CMD node dist/index.js`, Docker HEALTHCHECK on /health,
  PORT from env, no NODE_ENV=production (correct: dev auth refused under
  production), GIT_COMMIT re-declared in runtime stage. Matches package
  brief and server's env/health code (empty ALLOWED_ORIGINS answers `*`,
  verified in `server.ts`).
- Task 1 fly.toml: PASS — repo-root build context with
  `dockerfile = "apps/server/Dockerfile"` (correct: workspace install needs
  root), region lhr, http_service 8080 + force_https (wss upgrade needs no
  extra config), /health check, shared-cpu-1x, smoke env
  AUTH_MODE=dev / ALLOWED_ORIGINS empty-until-web-URL.
- Task 2 vercel.json: PASS — Root Directory apps/web with root-climbing
  install/build commands, frozen lockfile, filter build, output dist, SPA
  rewrite to /index.html excluding /assets/ (review sheet keeps serving).
- Task 2 DEPLOY.md runbook: PASS — exact per-host deploy/verify commands,
  per-host env tables (placeholders only), rollback + decommission per host,
  smoke→production checklist. Snippet values cross-checked:
  `protocol: 1` = PROTOCOL_VERSION, `northwind-demo` = WORKSPACE_ID;
  relative links (../fly.toml, ../apps/...) resolve. No `vercel build`
  dependency for local proof (documented CLI-login fallback to vite build).
- Task 3 public URL: honestly OPEN — credential blocker named, no auth or
  deploy command attempted.
- Task 4 secrets: PASS — none in repo; tokens live only in lead's shell/CI.

Fixes applied: none (no defects found; nothing to change inside Owns).
Requests: none.

Reviewer verdict: config scope PASSES; package stays partial until the lead
runs the credential-gated deploy + two-browser G3 check.
