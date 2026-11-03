# HANDOFF.md

Handoff of the Virtual Office from M2 to the agents who will build M3 to M6, and then to the
reviewer who checks the result. Read `AGENTS.md` first, then this file, then
`docs/IMPLEMENTATION_PLAN.md` and your package in `docs/WORK_PACKAGES.md`.

Baseline: the git tag `handoff-m3` on `main` marks the state handed over. The reviewer compares
the finished work against it.

---

## 0. Start here: the deadline sprint (written 2026-11-03)

**Deadline: 2026-11-04, 21:00 (the owner's local time).** Two streams run at once: the deploy
(P4-A, then the rehearsal P4-C) and Phase 6, office life (`WORK_PACKAGES.md` Phase 6, shared
design in `ARCHITECTURE.md` 12.10). The order, the feature freeze and the cut list are in
`IMPLEMENTATION_PLAN.md` 3.1. The rest of this file still applies.

**State of the code**
- `main` at `afb539a` or later: Phases 1 to 5 merged, except P4-A, P4-C and P5-D (the deploy and
  the rehearsals). The owner keeps merging fixes from their own sessions (`fix/*` branches; the
  latest touched sitting, reservations and the E chip). Fetch and rebase often, P6-A above all: it
  edits the same activity code.
- Set up on 2026-11-03 but **not committed** when this was written: `.gitignore` (the `.vercel`
  and `.env*.local` lines), `fly.toml` (the real app name), `.mcp.json` (the Supabase MCP), and the
  Phase 6 docs. If `git status` still shows them, the lead commits them first, on `main`, as
  "Lead: hosting accounts and the Phase 6 plan".

**Deployed 2026-11-03 (P4-A, fast mode, owner approved):** web
`https://meta-virtual-office.vercel.app`, server `https://meta-virtual-office.fly.dev` (Fly `sin`,
one machine). Fast mode: `AUTH_MODE=dev` (name picker), in-memory repo (no `DATABASE_URL`),
`FixtureLlm`; data resets when the machine stops. Verified live: `/health`, two players join over
the internet and see each other, `/me/day`, `/ask` answers the Acme question with sources and
abstains on the CEO question, CORS answers only the Vercel origins. How it was done (repeat it for
redeploys): `fly deploy` from the repo root; for the web, `vercel pull --yes --environment=production`,
`vercel build --prod --yes`, `vercel deploy --prebuilt --prod --yes`, all from the repo root.

**Region (measured, not guessed).** Connect times from the owner's machine: Mumbai 0.09 s,
Singapore 0.10 s, Frankfurt 0.22 s, US East 0.28 s. Fly no longer provisions Mumbai (`bom`), so
the server runs in Singapore (`sin`). The hosted Supabase project was auto-placed in **Frankfurt**
(AWS eu-central-1, found from its address), and the two migrations are applied there. Before the
full deploy, either create a new Supabase project in Singapore (ap-southeast-1), re-apply the
migrations and point `.mcp.json` at it, or move the server to Frankfurt (`fra`). The server and
the database must share a region.

**Hosting accounts (set up 2026-11-03)**

| Service | What exists | How to reach it |
|---|---|---|
| Fly.io | App `meta-virtual-office` in the owner's personal org (shown as "Dibya Debashish Bhoi", slug `personal`). Status pending: no machines, no deploy. Its URL will be `https://meta-virtual-office.fly.dev`. `fly.toml` names it and `fly config validate` passes. | `flyctl` 0.5.2 in `%USERPROFILE%\.fly\bin` (on the user PATH for new shells; otherwise call `~/.fly/bin/flyctl.exe`). Logged in on this machine. |
| Vercel | Project `meta-virtual-office` in team `debashish17s-projects`: Root Directory `apps/web`, Vite preset, Node 22.x. Linked at the **repo root** (`.vercel/`, ignored). No env vars, no deploys yet. | `vercel` CLI, logged in as `debashish17`. Deploy from the repo root (`vercel --prod`), not from `apps/web` as `DEPLOY.md` 2.1 says. |
| Supabase | Hosted project `ubhkqklqkqaydjfyoten` (`https://ubhkqklqkqaydjfyoten.supabase.co`). Empty: no tables, no migrations. The anon and publishable keys are active. Auth signs user tokens with ES256 (its JWKS holds an ES256 key), which is what `SupabaseAuth` verifies. | The Supabase MCP in `.mcp.json`. It is project-scoped: approve it when a session starts in the repo root, then authenticate once through `/mcp`. The Supabase CLI is not logged in and is not needed. |

**Rules for the hosted services**
- Every deploy, and every change to a hosted database or host setting, needs the owner's OK in
  your session (`AGENTS.md` section 2). Reading is always fine.
- Hosted schema: apply each file in `supabase/migrations`, in order, with the MCP's
  `apply_migration`, named after the file. Use only the MCP for the hosted schema. It records its
  own migration versions, so a later `supabase db push` would first need `supabase migration repair`.
- Secrets never go through chat or logs. The owner puts them in `.env.hosted.local` at the repo
  root (ignored through `.env*.local`). It holds:
  - `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY`;
  - `DATABASE_URL`: the Supavisor pooler string (`postgres.ts` turns prepared statements off for it);
  - `SEED_PASSWORD`: the demo users' password on the hosted project;
  - optionally `LLM_API_KEY`.

  Never print the file. Read its names only (`cut -d= -f1 .env.hosted.local`).
- Seed the hosted project: `node --env-file=.env.hosted.local supabase/seed.mjs`.
- Fly secrets: pipe only the server's names (`SUPABASE_*`, `DATABASE_URL`, `LLM_API_KEY`) into
  `fly secrets import --stage -a meta-virtual-office`, so nothing restarts. `fly.toml` `[env]`
  still says `AUTH_MODE = "dev"`. The full deploy changes it to `supabase` and adds
  `NODE_ENV = "production"`, because the server refuses dev auth in production.
- Vercel env (build-time, none secret), added with `vercel env add <NAME> production`:
  - `VITE_SERVER_URL=https://meta-virtual-office.fly.dev`;
  - `VITE_AUTH_MODE`;
  - `VITE_API=http`, **not** `mock`: with `mock` each browser keeps its own data, and approvals
    never reach the other browser;
  - `VITE_SUPABASE_URL`;
  - `VITE_SUPABASE_ANON_KEY`, from the MCP's `get_publishable_keys`.
- After the web deploy: set `ALLOWED_ORIGINS` on Fly to the Vercel URL (`DEPLOY.md` 1.3).

**Open owner questions** (ask before the step that needs them)
- D14, deploy mode: the full deploy (default, now that Supabase exists) or the fast fallback
  (`IMPLEMENTATION_PLAN.md` section 5).
- The Supabase project's region (Dashboard, Project Settings, General). `fly.toml` says
  `primary_region = "lhr"`; move it to the Fly region nearest the database before the first deploy.
- Committing the uncommitted setup files above.

**Next, in order**
1. Lead: commit the setup and the plan; build P6-0 on `wp/P6-0-contract` and merge it.
2. Deploy agent, with the owner: P4-A.
   1. Answer D14 and the region.
   2. Apply the migrations through the MCP and run the seed.
   3. Fly secrets and env, Vercel env.
   4. Deploy, with the owner's OK.
   5. Check `/health`, run a two-browser smoke test, set `ALLOWED_ORIGINS`.

   Today's `main` goes out first, so a working demo is online whatever happens later.
3. Once P6-0 is merged: P6-A, P6-R (receipts, USP A Phase 0) and P6-B, one lane agent each (the
   lane prompt in section 6; ports from section 5); P6-C when an agent is free. P6-D only by the
   rule in `IMPLEMENTATION_PLAN.md` 3.1.
4. Feature freeze 2026-11-04 at 15:00 to 16:00, then:
   1. merge;
   2. checks and e2e;
   3. redeploy;
   4. P6-E and P4-C on the public URL;
   5. the backup video.

---

## 1. The project in one minute

A real-time isometric 3D office (React Three Fiber client, Colyseus server, Supabase Postgres)
where a team's meetings update shared customer and project records. An AI proposes the changes and a
person approves each one. Anyone can ask the office "what's the status of Acme?" and get an answer
that cites its sources, or an honest "no record". The demo that must work, end to end, in two
browsers on a public URL, is in `docs/PROJECT_BRIEF.md` section 5.

## 2. What exists today

**Built and working** (M0 to M2, plus the owner's extra requests):

- A 64 x 40 m office on streets, fixed isometric camera that follows you, wheel zoom; GLB furniture
  kit from `blender-asset-pipeline/`, procedural architecture, a city outside the windows.
- You: walk (WASD, arrows, Shift to jog), click to walk (`findPath`), collision with walls, glass and
  furniture, zone pill, look editor (body, clothes, height).
- People: three Mixamo characters with recoloured clothes. Moves: idle, walk, jog, talk, phone,
  counter, sit down, seated, stand up, sit and talk, type. Hands are kept on the desk while typing.
- Colleagues: nine presets with daily routines (type, tea point, chat, phone calls), reserving seats
  and spots so nobody shares one. You can sit at any free desk and type, or make a drink at the counter.
- Tests: 51 shared, 13 web, 2 server (Vitest), 92 pipeline (Python). All pass.

**Not built yet:** the multiplayer room (the server is still the M0 hello room), client networking,
database, auth, LLM, the HTTP API and every product panel. That is this plan.

**Where things are**

| Path | What |
|---|---|
| `packages/shared/src/world/` | `office.ts` (layout: the source of truth for every coordinate), `walk.ts` (`WalkMap`, `findPath`), `index.ts` (`WORLD`, `ZONES`, `FURNITURE`, `OFFICE_WALK`, `zoneAt`) |
| `packages/shared/src/people/` | `look.ts` (looks, the baked bodies and moves manifest) |
| `apps/web/src/office/` | `OfficeScene.tsx` (composition), `Avatar.tsx` (you), `Person.tsx` (one animated person), `Colleagues.tsx` with `routine.ts`, `interactions.ts` (sit, type, counter), `moves.ts`, `deskReach.ts`, `Hud.tsx`, `me.ts` (your name and look), `state.ts` |
| `apps/web/scripts/` | `screenshot.mjs` (headless capture), `people/bake.mjs` (Mixamo to GLB; source files are not in the repo) |
| `apps/server/src/` | `index.ts`, `office.room.ts` (M0 hello room) |
| `docs/screenshots/` | M1 and M2 reference screenshots |

Dev hooks (development builds only): `window.__officeDebug` (`teleport(x, z)`, `walkTo({x, z})`,
`interact()`, `avatar`, `doing`), `window.__officePeople` (every person's pose), `window.__officeReady`.

## 3. Owner decisions (fill in before the phase that needs them)

The defaults and what each decision blocks are in `docs/IMPLEMENTATION_PLAN.md` section 5.

| ID | Decision | Owner's answer |
|---|---|---|
| D1 | G2 approved (movement smooth at 60 fps in your browser) | Approved (2026-11-01) |
| D2 | Visual freeze for M3 to M6 | Yes (2026-11-01) |
| D3 | Web host and WebSocket host (accounts created by the owner) | Default accepted (2026-11-02): web on Vercel, server on Fly.io/Render; deploy access for the lead pending |
| D4 | Local Supabase now; hosted project before Phase 4 | Hosted project created by the owner (2026-11-03): `ubhkqklqkqaydjfyoten`, empty (section 0) |
| D5 | LLM provider for the real adapter | Muse Spark (`muse-spark-1.3`) through the Meta Model API (2026-11-01) |
| D6 | Colleagues run on the server (or are removed when online) | Keep them, run on the server, same for everyone (2026-11-02) |
| D7 | Player contract additions (look, pose, speed, activity) | Accept (2026-11-01) |
| D8 | Demo sign-in (seeded test users locally, email and password deployed) | Default accepted (2026-11-02): seeded Maya/Arjun picker locally, email and password deployed |
| D9 | Live meetings with LiveKit after G6, if time permits; the fixture transcript stays the fallback | Yes, if time permits (2026-11-01) |
| D10 | Office life (Phase 6) before the deadline | Yes (2026-11-03) |
| D11 | Home desks | Each person sits at their own desk in their department; sofas and other seats are free for anyone (2026-11-03) |
| D12 | Colleagues (NPCs) | Keep a few for life in the office: four (2026-11-03) |
| D13 | Meetings | In the existing rooms; a virtual call-only meeting when all are busy (cut first) (2026-11-03) |
| D14 | Deploy mode (full, or the fast fallback) | Not decided yet; default full |
| D15 | USP A Phase 0 (receipts) before the deadline | Yes, as P6-R; USP A Phases 1 to 4 after the deadline (2026-11-03) |

**What the owner prepares, and when**

- Before Phase 1: answers D1, D2 and D7 (the others can wait for the phase that needs them);
  keeps Docker Desktop running on the build machine (local Supabase); decides whether there will be
  a git remote, and if so makes it private (the Mixamo files, `AGENTS.md` section 5).
- From Phase 2, optional: a Meta Model API key (the hackathon's Model API key) as `LLM_API_KEY` in
  the server's `.env` (never committed, never pasted in chat). P2-D uses it to check the API's JSON
  and reasoning-effort settings. Without it everything runs on `FixtureLlm`, which is also what the
  tests use.
- For P3-D: the web host and the WebSocket host accounts (D3), with deploy access for the lead.
- For Phase 4: the hosted Supabase project (D4). Its URL and keys go into the hosts' secret
  settings and the lead's local `.env`, not into chat or the repo.
- For Phase 5, only if it runs: a LiveKit Cloud project (D9). Its URL, API key and secret go into
  the server's env only.

## 4. Machine and setup

The owner's machine: Windows 11, Git Bash and PowerShell, Node 22.22, pnpm 12.8.1, Python 3.13,
Docker Desktop (needed for local Supabase), Chrome at `C:\Program Files\Google\Chrome\Application\chrome.exe`.
There is no git remote. If one is added it must be **private**: the Mixamo files cannot be
redistributed (`AGENTS.md` section 5).

```bash
pnpm install
pnpm typecheck && pnpm lint && pnpm test
pnpm dev                      # web http://localhost:5173/  server http://localhost:2567/health
```

**Known quirks** (each cost time before)

- In Git Bash, a heredoc that contains quotes can fail with "unexpected EOF". Write multi-line
  scripts to a file and run the file.
- After files move, Vite can keep serving the old module. Restart `pnpm dev`, and confirm with
  `curl http://localhost:5173/src/<file>`.
- A Chrome window driven over DevTools runs at about 1 fps when hidden. Check timing (animations,
  sequences) with a headless script like `apps/web/scripts/screenshot.mjs`, and frame rate in a normal,
  visible browser. Headless Chrome renders in software: its fps is not a GPU benchmark.
- Importing `/src/...` from the page console can give a second copy of a module (Vite adds
  timestamps). Use the dev hooks instead.
- "LF will be replaced by CRLF" warnings from git are harmless.
- `supabase start` pulls about a gigabyte of images the first time (minutes). `supabase status`
  prints the local URLs and keys; the local JWT secret is HS256. Local ports: 54321 (API), 54322
  (Postgres), 54323 (Studio). One local Supabase per machine.
- After `pnpm install`, run `npx playwright install chromium` once per machine.
- Right after `pnpm install` rewrites the turbo binary, `pnpm dev` / `pnpm test` (turbo) can fail
  with `Error: spawn UNKNOWN` for a while, even `npx turbo --version` (seen 2026-11-03; most likely
  Windows scanning the new 50 MB exe). It clears by itself; meanwhile run a package's script
  directly (`pnpm --filter @office/server dev`).
- Node timers on Windows fire on a 15.625 ms grid: `setInterval(50)` runs every 62.5 ms. Anything
  that must keep a rate counts the wall clock (the room's `FixedStep`), never the interval.
- Every git worktree needs its own `pnpm install` (about 30 s); it gets its own `node_modules` and
  Vite cache.
- Colyseus 0.18: subscribe to state with `getStateCallbacks(room)` from `@colyseus/sdk`; the
  `state.players.onAdd(...)` form from older tutorials does not exist. The token goes in
  `client.auth.token`, not in the join options.
- Slow GPU-less boxes (the AWS instance): one headless page needs ~70 s to reach ready,
  the second ~230 s while the first renders, and remote pills up to ~190 s after online.
  The e2e waits are schedule bounds for this (see the comments in `e2e/*.spec.ts`);
  a multiplayer timeout here is contention until proven otherwise — check the pill
  rendered, not just the clock.

## 5. How the agents work together

**Roles**

- **Lead** (one agent):
  - builds P1-A and P1-C;
  - assigns packages and creates their branches;
  - reviews each report and checks acceptance;
  - merges into `main`; owns the shared contracts after Gate P1;
  - keeps the status board (section 7) and talks to the owner at gates.
- **Lane agents**: one package at a time, only inside the files that package owns.
- **Reviewer**: after Phase 4, checks everything (section 8). Not one of the builders.

**Branches and worktrees.** Every package gets its own branch and its own git worktree, so agents
never share a working folder:

```bash
git worktree add ../vo-P2-A -b wp/P2-A-room-server main
cd ../vo-P2-A && pnpm install
```

**Ports.** Every agent that runs the app uses its own ports (P1-B makes them configurable):

| Agent slot | `WEB_PORT` | `PORT` (server) | `CHROME_DEBUG_PORT` |
|---|---|---|---|
| lead | 5173 | 2567 | 9341 |
| lane 1 to 7 | 5173 + n | 2567 + n | 9341 + n |

**Local Supabase** is a single instance on this machine. Database tests create their own workspace
rows and clean up after themselves. Only the agent holding P2-C (in Phase 2) or the lead (later)
runs `pnpm db:reset`.

**File ownership.** A package changes only the paths listed under "Owns" in `WORK_PACKAGES.md`.
If you need anything else (another package's file, a shared contract, a new dependency, an entry
file), do not edit it. Add a "Requests" section to your report saying what and why, then carry on
with the rest of your package. The lead makes the change on `main`, and you rebase.

**Contract review.** Before Gate P1, one lane agent who did not write them reads
`packages/shared/src/{net,api,sim,demo}` and `ARCHITECTURE.md` sections 4, 5 and 12, and lists
every ambiguity as a question. The lead answers in the code or the docs before Phase 2 starts.
Half a day; it saves seven lanes from guessing the same thing seven ways.

**Dependencies.** P1-B installs every package the plan needs. After Gate P1 nobody else edits
`package.json` or `pnpm-lock.yaml`. A missing dependency is a request to the lead.

**Commits and merging**

- Commit small and often on your branch, with clear messages.
- When done:
  1. Rebase on the current `main`.
  2. Run the checks.
  3. Write `docs/reports/<ID>.md`.
  4. Stop. Lane agents never merge.
- The lead merges with `git merge --no-ff`, runs the checks on `main` after every merge, then tells
  the other lanes to rebase.
- Never force-push or rewrite `main`. Never change or delete a test to make it pass: report it.

**Report** (`docs/reports/<ID>.md`): the `AGENTS.md` section 8 format, plus:
- **Files changed outside "Owns":** should be none.
- **Requests:** contract changes, dependencies, files owned by others.
- **How to verify:** commands to run, URLs to open.

## 6. Run sheet

| Wave | Start when | Packages (one agent each, in parallel) |
|---|---|---|
| 1 | Owner approves D1, D2, D7 | P1-A1 (lead), P1-A2, P1-B (or P1-A whole, with two agents) |
| 2 | P1-A merged | P1-C (lead); P1-B continues; one lane agent reviews the contracts |
| Gate P1 | P1-A, P1-B, P1-C merged | lead checks, owner informed |
| 3 | Gate P1 | P2-A, P2-B, P2-C, P2-D, P2-E, P2-F, P2-G |
| 4 | Their dependencies merged | P3-A, P3-B, P3-D (P3-D needs D3); P3-C starts against the contract |
| 5 | P3-B, P3-C merged | P3-E; G3, G4 and G5 are reported to the owner |
| 6 | G5 approved, D4 hosted project ready | P4-A, P4-B, then P4-C; G6 |
| 7 | G6 approved, time permits, D9 | P5-A ‖ P5-B, then P5-C, then P5-D; Gate G7 |
| 8 | D10 (2026-11-03), beside P4-A | P6-0 (lead); then P6-A ‖ P6-B ‖ P6-C; then P6-D if time; then P6-E; Gate G8 |
| 9 | G6 and G8 (and G7 if Phase 5 ran) | Final review (section 8) |

**With fewer agents**, run these chains instead of one package per agent:

| Agents | Chains |
|---|---|
| 4 | (1) P2-C, P2-D, P2-E, P3-B · (2) P2-A, P3-A, P3-D · (3) P2-B, P2-G, P3-C · (4) P2-F, then P3-E |
| 3 | (1) P2-C, P2-D, P2-E, P3-B · (2) P2-A, P2-B, P3-A, P3-D · (3) P2-F, P2-G, P3-C, P3-E |
| 2 | (1) server side: P2-A, P2-C, P2-D, P2-E, P3-B, P3-D · (2) web side: P2-B, P2-F, P2-G, P3-A, P3-C, P3-E |

**Prompt for the lead** (copy, fill in the path):

> You are the lead agent for the Virtual Office repository at `<repo path>`. Read `AGENTS.md`,
> `docs/HANDOFF.md`, `docs/IMPLEMENTATION_PLAN.md` and `docs/WORK_PACKAGES.md`. Check that the owner's
> decisions in `HANDOFF.md` section 3 are filled in for Phase 1. Then:
> 1. Build P1-A1 (or all of P1-A) and then P1-C yourself, on their own branches; hand P1-A2 and
>    P1-B to other agents at the same time, and have a lane agent review the contracts before Gate P1.
> 2. Keep the status board in `HANDOFF.md` section 7.
> 3. Merge each package after checking its acceptance criteria and report.
> 4. At every gate, stop and report to the owner in the `AGENTS.md` section 8 format.
>
> Never start a phase the owner has not approved. Do not implement other packages yourself:
> hand them to lane agents with the lane prompt in `HANDOFF.md` section 6.

**Prompt for a lane agent** (the lead fills in the angle brackets):

> You are building work package `<ID> <title>` for the Virtual Office repository. Your worktree is
> `<worktree path>`, on branch `<branch>`, created from `main` at `<commit>`. Use `WEB_PORT=<n>`,
> `PORT=<m>`, `CHROME_DEBUG_PORT=<k>`.
>
> Read `AGENTS.md`, `docs/HANDOFF.md` (sections 4 and 5 especially), `docs/IMPLEMENTATION_PLAN.md`
> and the `<ID>` section of `docs/WORK_PACKAGES.md`, then the docs it points to.
>
> Change only the paths your package owns. Anything else goes under "Requests" in your report.
> Write tests first for logic. When every acceptance item is met:
> 1. Rebase on `main`.
> 2. Run `pnpm typecheck`, `pnpm lint` and `pnpm test` (and `pnpm test:e2e` if your package has e2e tests).
> 3. Commit.
> 4. Write `docs/reports/<ID>.md`.
> 5. Stop. Do not merge, and do not start another package.

## 7. Status board (the lead keeps this current)

| Package | Agent | Branch | State | Report |
|---|---|---|---|---|
| P1-A1 net, sim, people (or P1-A whole) | lead + builder/reviewer | wp/P1-A1-net-sim-people | merged (content via the 6f2bbfd checkpoint, squashed not --no-ff) | P1-A1.md |
| P1-A2 api, demo | builder/reviewer | wp/P1-A2-api-demo | merged (content via the 6f2bbfd checkpoint, squashed not --no-ff) | P1-A2.md |
| P1-B tooling | builder/reviewer | wp/P1-B-tooling | merged (content via the 6f2bbfd checkpoint, squashed not --no-ff) | P1-B.md |
| P1-C app skeletons and slots | builder/reviewer | | merged (content via the 6f2bbfd checkpoint, squashed not --no-ff) | P1-C.md |
| P2-A room server | builder/reviewer | | merged (content via the 6f2bbfd checkpoint, squashed not --no-ff) | P2-A.md |
| P2-B web networking | builder/reviewer | | merged (content via the 6f2bbfd checkpoint, squashed not --no-ff) | P2-B.md |
| P2-C database | builder/reviewer | | merged (content via the 6f2bbfd checkpoint, squashed not --no-ff) | P2-C.md |
| P2-D LLM and meetings | builder/reviewer | | merged (content via the 6f2bbfd checkpoint, squashed not --no-ff) | P2-D.md |
| P2-E ask and status | builder/reviewer | wp/P2-E-ask-status | merged (--no-ff d58b677) | P2-E.md |
| P2-F product panels | builder/reviewer | wp/P2-F-panels | merged (--no-ff 6642893) | P2-F.md |
| P2-G wall displays | builder/reviewer | wp/P2-G-wall-displays | merged (--no-ff 60f9e0c) | P2-G.md |
| P3-A shared colleagues | builder/reviewer | wp/P3-A-shared-colleagues | merged (--no-ff 0b480f2 + lead wiring 1661200; NPC sync probe-verified) | P3-A.md |
| P3-B HTTP API and auth | builder/reviewer | wp/P3-B-http-api-auth | merged (--no-ff 98cf6ba) | P3-B.md |
| P3-C web wiring and sign-in | builder/reviewer | wp/P3-C-web-wiring | merged (--no-ff d8868ee + lead wiring 24cc192; contract 4/4 live) | P3-C.md |
| P3-E demo end to end | builder/reviewer | wp/P3-E-demo-e2e | merged (--no-ff 080dfcf; demo.spec green in-suite 5.1m, suite red on box contention) | P3-E.md |
| P3-D deploy smoke test | builder/reviewer | wp/P3-D-deploy-smoke | merged config (--no-ff ba1d5b6; deploy execution blocked on owner Fly/Vercel tokens) | P3-D.md |
| P4-B hardening | builder/reviewer | wp/P4-B-hardening | merged (--no-ff f27c3fc) | P4-B.md |
| P4-A production deploy | lead | main | fast mode live 2026-11-03 (section 0): web on Vercel, server on Fly `sin`, in-memory data; full mode waits for D14, a database in the server's region, and `.env.hosted.local` | |
| P5-A call service | builder/reviewer | wp/P5-A-call-service | merged (--no-ff cf174c1) | P5-A.md |
| P5-B call UI | builder/reviewer | wp/P5-B-call-ui | merged (--no-ff 3daff7c + lead share mount; live media open on LiveKit creds) | P5-B.md |
| P5-C call transcript | builder/reviewer | wp/P5-C-transcript | merged (--no-ff 0da0c43 + lead wiring 606c57f; arrival asserts live, mic open) | P5-C.md |
| P5-D live rehearsal | | | blocked (owner LiveKit project + participation) | |
| P4-C rehearsal | | | blocked (needs P4-A deploy first) | |
| Improvement loop (lead) | lead | main (fba1251 + demo/teleport fix) | done: dev-auth Postgres ids, Players memo, chat history pull, dev teleport (idle-reconcile fixed), test:scripts; gates green, contract 4/4, e2e spot-check green (demo 5.1m, calls + live-meeting 5/5). Demo fix: dismiss Calls-unavailable panel (covers drawer) + idle-sync decision clicks. Request to P5-B: call panel structurally overlaps the drawer column during live calls | |
| FIX avatar-sync + office-glitches (owner) | owner session | fix/avatar-sync, fix/office-glitches | merged (--no-ff, owner request 2026-11-03): room at a true 20 Hz with an input queue, reconcile and draw-between-ticks, paced remote snapshots; name tags under panels, Ask close, typing above the desk, people keep apart, chairs swivel; open items closed; then sitting: walk off after standing up (WalkMap step-out), the E action chip and seat halo, synced reservations (OfficeState.taken) | FIX-avatar-sync.md, FIX-office-glitches.md, FIX-sitting.md |
| P6-0 contract and slots | lead | wp/P6-0-contract | not started | |
| P6-A status, home desks, colleagues | | wp/P6-A-status-desks | not started (needs P6-0) | |
| P6-R receipts (USP A Phase 0) | | wp/P6-R-receipts | not started (needs P6-0) | |
| P6-B meetings in the rooms | | wp/P6-B-meetings | not started (needs P6-0) | |
| P6-C personal notes | | wp/P6-C-notes | not started (needs P6-0) | |
| P6-D free seating and board | | wp/P6-D-seating-board | not started (only if time; needs P6-A) | |
| P6-E office-life demo | | wp/P6-E-demo | not started (needs P6-A, P6-B) | |

States: not started, in progress, blocked (say why), in review, merged.

## 8. Final review (the owner hands this to the reviewer after G6, or after G7 if Phase 5 ran)

**What the reviewer gets:**
- `main` at the final commit;
- the tag `handoff-m3` (the baseline);
- every `docs/reports/*.md`;
- the status board;
- the deployed URLs;
- the owner's decision table (section 3).

**Prompt for the reviewer:**

> Review the Virtual Office repository at `<repo path>`. The work since the tag `handoff-m3` was
> built by several agents from `docs/IMPLEMENTATION_PLAN.md` and `docs/WORK_PACKAGES.md`. Follow
> the checklist in `docs/HANDOFF.md` section 8. Report each gate and each checklist item as pass, fail
> or not verified, with evidence and the most serious problems first. Do not fix anything unless the
> owner asks.

**Checklist**

1. **Completeness.** Every package on the status board is merged, with a report (the Phase 5
   packages only if the phase ran). Every gate item (P1, G3 to G6, and G7 if Phase 5 ran) is
   checked, with evidence.
2. **Fresh checks.** In a clean clone or worktree: `pnpm install`, `pnpm typecheck`, `pnpm lint`,
   `pnpm test`, `pnpm test:e2e`, `python blender-asset-pipeline/run.py test`, `pnpm db:reset`
   followed by the database tests, and `pnpm build` followed by `node apps/server/dist/index.js`
   (the server starts and `/health` answers).
3. **Tests not weakened.** Run `git log -p handoff-m3..main` on the test and e2e files. Every
   deleted test or loosened assertion has a reason in a report, and the reason holds up.
4. **Contracts honoured.**
   - Every socket handler and HTTP route parses its input with the shared Zod schemas.
   - No payload types are declared outside `packages/shared`.
   - The client never sends a position.
   - No AI path writes to records except through approved `proposed_changes`.
   - `packages/shared` imports nothing from `three`, `react` or the DOM (the lint rule exists and passes).
   - The designs in `ARCHITECTURE.md` section 12 were followed, or the departure is explained in a report.
5. **Security.**
   - Nothing like a key, token or password is committed: `git grep` for `service_role`, `sk-`,
     `eyJ`, `password`, `secret`.
   - `.env` is not tracked.
   - The service role and LLM keys appear only in server code.
   - Every workspace table has RLS (check `pg_tables.rowsecurity`), and the isolation test exists and passes.
   - The server refuses `AUTH_MODE=dev` in production.
   - Rate limits exist and are tested.
6. **AI behaviour.**
   - With `LLM_API_KEY` unset, the whole demo works on `FixtureLlm` and the notice shows.
   - The CEO question abstains.
   - An answer citing an ID outside the retrieved set is discarded (test).
   - Invalid LLM output is retried once, then falls back (test).
7. **The demo.** The `PROJECT_BRIEF.md` section 5 script on the deployed URL in two browsers, by
   hand, plus a reconnect and a reload. `pnpm demo:reset` restores the start. The frame rate with
   two players and the colleagues, from a real browser, is in a report.
8. **Scope and decisions.**
   - The locked decisions (`AGENTS.md` section 4) still hold.
   - The visual freeze held: changes to the scene files are limited to slots, remote people,
     colleagues and wall displays.
   - Nothing out of scope (`PROJECT_BRIEF.md` section 7) was added.
9. **Docs.** `README.md` (setup, deploy, known limitations), `AGENTS.md` (commands verified) and
   `ARCHITECTURE.md` (contracts) match the code.
10. **Licence.** The repository is private (or the people assets are excluded from any public
    copy); `apps/web/public/assets/people/LICENSE.txt` is present.
11. **History.** `main` is the baseline plus `--no-ff` merges of package branches and the lead's own
    commits; nothing was force-pushed; every merged package has a report.
12. **Live meetings** (only if Phase 5 ran). Tokens are issued only for the room the player is in
    (test); with no LiveKit keys the office and the fixture demo are unchanged; microphone denied
    gives listen-only; a live transcript went through the same pipeline as the fixture one.

The reviewer's report: one line per gate (pass, fail or not verified), then findings ordered by
severity, each with the file, the evidence and the fix suggested.

## 9. Plan review log

**2026-11-01, review before handoff.** The plan was checked against the installed libraries
(Colyseus 0.18.24, `@colyseus/schema` 5.0.42, Zod 4.6.7, Node 22) and current package versions, and
tightened where lanes would otherwise have guessed:

- `ARCHITECTURE.md` section 12 added: movement sync and reconciliation, the room registry and
  `PROTOCOL_VERSION`, auth modes and token transport, database access with RLS applied to the
  server's reads, seeding users through the Auth Admin API, the Anthropic adapter, the web data
  layer, deployment, test tools.
- P1-A can be split (P1-A1 ‖ P1-A2). P1-C's stub room holds the state shape so P2-B can start
  before P2-A; P2-B finishes after P2-A.
- A contract review by a lane agent before Gate P1.
- P1-B installs `@colyseus/testing` and `@anthropic-ai/sdk`, the Playwright browser, the
  shared-package lint rule, and gives the e2e stack its own ports.
- Demo users are keyed (`maya`, `arjun`), not fixed UUIDs; a `profiles` table; the seed is a script.
- `env.ts` fails fast; `/health` reports the deployed configuration; a `records` store and a
  contract test suite shared by the mock and the HTTP API.
- Owner preparation list (section 3), more quirks (section 4), more reviewer checks (section 8),
  a team-size estimate (`IMPLEMENTATION_PLAN.md` section 3).

**2026-11-01, later.** Live meetings (voice, video, screen share and the transcript of a real meeting,
with LiveKit) added as the optional Phase 5 after G6 (decision D9), with the fixture transcript as
the standing fallback; the final review is now Phase 6. `ARCHITECTURE.md` 12.9, packages P5-A to
P5-D, Gate G7, and the locked decision in `AGENTS.md` section 4 updated to match.

**2026-11-01, decision D5.** The real LLM adapter is Muse Spark (`muse-spark-1.3`) through the Meta
Model API, called with OpenAI's SDK (`openai`), replacing the Anthropic adapter planned above.
`LLM_BASE_URL` added (default `https://api.meta.ai/v1`). P1-B installs `openai` instead of
`@anthropic-ai/sdk`. JSON-schema output, the reasoning-effort parameter and the latency at `low` are
not yet verified against the API; P2-D checks them. `ARCHITECTURE.md` 12.5, P1-B, P2-D, the D5 rows
and `PROJECT_BRIEF.md` section 10 updated.

**2026-11-03, office life and the deadline sprint.** The owner asked for the office to be used, not
decorative (decisions D10 to D13), with the deadline 2026-11-04 at 21:00. Added: Phase 6 (P6-0 to
P6-E, Gate G8) in `WORK_PACKAGES.md`; its shared design in `ARCHITECTURE.md` 12.10, including
`go_to` as the only message that moves people, so the call store's status restore never does;
the deadline order and cut list in `IMPLEMENTATION_PLAN.md` 3.1; the final review renumbered to
Phase 7; the hosting accounts and the start-here notes in section 0 of this file; the scope note
in `PROJECT_BRIEF.md` section 6. D14 (deploy mode) is open.
