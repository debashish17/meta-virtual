# P1-B Tooling for parallel work — checkpoint report

Work package / gate: P1-B Tooling for parallel work (Phase 1)
Status: passed

Done:

- Installed every dependency the later packages need (task 1); versions recorded below.
- Ports from env (task 2): `WEB_PORT` (vite config + `dev`/`preview` scripts), `PORT`
  (server already read it), `CHROME_DEBUG_PORT` (screenshot script). Also added the
  Turbo `dev`-task `env` allowlist — without it Turbo 2.x strict mode drops the vars
  and a second stack fails (found by testing).
- Playwright (task 3): `playwright.config.ts` (e2e stack on 5190/2590,
  `reuseExistingServer` outside CI), `e2e/helpers/twoUsers.ts` (two isolated
  contexts), `e2e/smoke.spec.ts` (both reach `window.__officeReady`), root
  `pnpm test:e2e`. Chromium installed.
- Local Supabase (task 4): `supabase init` config, root `db:start` / `db:stop` /
  `db:reset` / `db:seed` scripts, `supabase/seed.mjs` stub. `[db.seed]` disabled in
  `config.toml` since seeding goes through `seed.mjs`, not `seed.sql`. No hosted
  project created.
- `.env.example` (task 5): all names from the package; `SUPABASE_JWKS_URL` chosen
  over `SUPABASE_JWT_SECRET` and verified (local Auth serves JWKS, ES256).
- Docs (task 6): `AGENTS.md` section 5 and `README.md` commands updated, `(P1-B)`
  marks removed.
- ESLint rule for `packages/shared` (task 7): `no-restricted-imports`
  (`three`, `react`, `react-dom`, `@react-three/*`) and `no-restricted-globals`
  (`window`, `document`). Passes on the tree; a probe file with all three
  violations was caught (3 errors) and removed.
- Vitest (task 8): no config change needed — default env is node (probe asserting
  `typeof window === "undefined"` passed); per-file `// @vitest-environment jsdom`
  plus `@testing-library/react` verified with a probe (passed); probes removed.

Evidence:

- Installed: `@colyseus/sdk` 0.18.9, `@supabase/supabase-js` 2.118.0, `jsdom`
  30.1.3, `@testing-library/react` 16.3.3, `postgres` 4.0.0, `jose` 6.2.14,
  `openai` 7.47.0, `@colyseus/testing` 0.18.6, `@playwright/test` 1.64.1,
  `supabase` 2.122.0 (CLI), Playwright Chromium, Turbo resolved 2.11.10.
- `pnpm typecheck`: 3/3 pass. `pnpm lint`: 3/3 pass. `pnpm test`: 110 pass
  (shared 107, server 2, web 1). `pnpm build`: ok. `pnpm test:e2e`: 1/1 pass
  (smoke, ~2 min incl. stack boot).
- Two stacks at once: 5173+2567 and 5174+2568 served together (web 200,
  `/health` ok on both servers).
- Screenshot script: 1440x810 capture via `CHROME_DEBUG_PORT=9347` against the
  second stack; listener observed on 9347 (`chrome`), nothing on 9341. Captures
  at `C:\tmp\p1b-shot*.png` (outside the repo).
- `pnpm db:start`: local stack up (API 54321, Postgres 54322, Studio 54323).
  `pnpm db:reset`: exit 0, migrations + seed stub ran. `pnpm db:stop`: exit 0.
  Stack restarted afterwards and left running for the next agent. JWKS endpoint
  serves 1 ES256 key.
- Docker Desktop was not running at first; started it from its installed path,
  daemon up in ~15 s.

Deviations:

- Built in the shared checkout on `main`, uncommitted, like the P1-A builders —
  no worktree or branch was created for this task. Nothing committed, per
  instructions.
- `turbo.json` gained a `dev`-task `env` allowlist (ports + `VITE_*`). Owned
  file; required, not optional: Turbo 2.x strict env filtering otherwise drops
  `WEB_PORT`/`PORT` and parallel stacks cannot run.
- `supabase/config.toml` `[db.seed]` set to `enabled = false` (owned file):
  the plan seeds via `seed.mjs`, and leaving it on warns on every reset.
- `supabase/.gitignore` is new (written by `supabase init`).

Files changed outside "Owns":

- `eslint.config.js` — task 7 mandates the shared-package rule but "Owns" does
  not list the file. Changed; request retroactive approval.
- `supabase/seed.mjs` (new) — task 4 mandates the stub but "Owns" lists only
  `supabase/config.toml`. Added; request retroactive approval.

Requests:

- Approve the two files above (or say where the lint rule should live instead).
- `ARCHITECTURE.md` 12.3 says the local CLI verifies HS256 with
  `SUPABASE_JWT_SECRET`; CLI 2.122 signs ES256 locally with a JWKS endpoint
  (verified above), so that sentence is outdated. Lead to update; P3-B verifies
  with `jose` against `SUPABASE_JWKS_URL` locally and hosted.
- Add `test-results/` and `playwright-report/` to root `.gitignore` (not owned
  by P1-B). e2e artifacts were deleted after the run.
- When P1-C's `env.ts` lands, its new server vars (`DATABASE_URL`,
  `SUPABASE_*`, `AUTH_MODE`, `ALLOWED_ORIGINS`, `LLM_*`) must be added to the
  `dev`-task `env` allowlist in `turbo.json`, or `pnpm dev` will not see them
  under Turbo strict mode.

How to verify:

- `pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e && pnpm build`
- `pnpm dev` in one shell, `WEB_PORT=5174 PORT=2568 pnpm dev` in another; open
  both URLs.
- `pnpm db:start && pnpm db:reset` (needs Docker Desktop running).

Open questions:

- None for P1-B. Open owner decisions D3/D4/D6/D8 are not needed by this
  package.

Next:

- P1-C (skeletons) and the Phase 2 lanes are unblocked: dependencies installed,
  e2e ports fixed, local database running, contracts owned by P1-A.

Review fixes (reviewer, 2026-11-01, in `e2e/smoke.spec.ts` + `playwright.config.ts`):

- The smoke test as built (both pages navigate at once, 90 s wait each) failed
  on re-run: one page needs ~70 s of headless software rendering, and two
  concurrent pages contend so the second needs 200+ s. Measured: single page
  64-79 s (69 s warm), second page ~201 s while the first keeps rendering.
- Fix: pages load sequentially with the existing dev profiling switches
  (`/?noao&noshadow`, ~35 s per page), wait 150 s each, config timeout 300 s.
  The assertions are unchanged (ready in both contexts, canvas visible in
  both): scheduling and render-cost switches only, not a weakened test.
- Verified after the fix: `pnpm test:e2e` 1/1 pass (2.9 min).
