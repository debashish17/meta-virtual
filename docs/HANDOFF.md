# HANDOFF.md

Handoff of the Virtual Office from M2 to the agents who will build M3 to M6, and then to the
reviewer who checks the result. Read `AGENTS.md` first, then this file, then
`docs/IMPLEMENTATION_PLAN.md` and your package in `docs/WORK_PACKAGES.md`.

Baseline: the git tag `handoff-m3` on `main` marks the state handed over. The reviewer compares
the finished work against it.

---

## 0. Start here: the deadline sprint (updated 2026-11-04, just after midnight)

**Deadline: 2026-11-04, 21:00 (the owner's local time).** What gets judged is the public demo:
the Acme script (`PROJECT_BRIEF.md` section 5) in two browsers on the deployed URL. The new work
for the deadline is Phase 6 (`WORK_PACKAGES.md` Phase 6; shared design in `ARCHITECTURE.md` 12.10;
order, feature freeze and cut list in `IMPLEMENTATION_PLAN.md` 3.1). The rest of this file still
applies. **Nothing in Phase 6 has been started.**

**State right now**
- `main` is **pushed**: GitHub `debashish17/meta-virtual` (private) holds everything through this
  handoff update (code last changed in `95e408f`). `git log origin/main..main` lists anything
  newer that is local only. Phases 1 to 5 are merged; the plan, the hosting setup, the deploy
  config, the first-visit name card and the refresh-ghost fix are on `main`. Before pushing:
  `git fetch` and
  `git rev-list --left-right --count main...origin/main` must show `N 0` (never force-push; the
  history was rewritten on 2026-11-03, so any older copy must be reset to `origin/main` first).
- Checks on `95e408f` (2026-11-04): `pnpm typecheck`, `pnpm lint` and `pnpm test` pass (server
  192, shared 123, web 192 tests); `pnpm test:e2e` 8 of 8, including `demo.spec` (2.0 min).
- The owner keeps merging fixes from their own sessions (`fix/*` branches; the latest touched
  sitting, reservations, the E chip and "my day"). Fetch and rebase often, P6-A above all: it edits
  the same activity code.
- `docs/USP_A_IMPLEMENTATION_PLAN.md` is the owner's plan for after the deadline. Only its Phase 0
  runs now, as P6-R.

**Live now (P4-A, fast mode, deployed with the owner's OK)**
- Web: `https://meta-virtual-office.vercel.app`, built from `95e408f`. Server:
  `https://meta-virtual-office.fly.dev`, one machine in Fly region `sin`, image built from
  `95e408f` (`/health` reports the version). Roll back with `fly deploy --image` and the previous
  image tag (`fly releases -a meta-virtual-office` lists them).
- Sign-in, fast mode: `AUTH_MODE=dev`, so the server trusts `dev:<name>`. A first visit to the
  deployed site shows a "Who are you?" card before the office loads: type your own name, or Join as
  Maya / Join as Arjun for the demo script. The choice is kept in that browser (`office.me` in
  local storage) and the "Name — switch" chip changes it. Development builds (local dev, e2e,
  screenshots) skip the card and join as before; `?name=` links skip it too. Two people who pick
  the same name still share one identity; only the full deploy (real accounts) fixes that.
- Data: the in-memory repo (no `DATABASE_URL`). It resets whenever the machine stops; the machine
  stops when idle and starts on the next visit in a few seconds.
- AI: the live model, Muse Spark `muse-spark-1.3` (decision 4 below, with its known risk on the
  meeting step).
- Verified live: `/health`; two players join over the internet in under 0.4 s and see each other;
  a fresh browser gets the name card, joins as its own player, and skips the card after a reload;
  `/me/day`; `/ask` answers the Acme question with six sources and abstains on the CEO question;
  CORS answers only the two Vercel origins in `fly.toml`.

**Implemented since the plan was written (2026-11-04, `644d96f`)**
- `apps/web/src/office/me.ts`: `useMe` gains `chosen` (true when the name came from `?name=`, this
  browser's storage, or a pick; false for the 'Maya' fallback). `setName` sets it.
- `apps/web/src/auth/AuthGate.tsx`: in dev auth, `DevGate` shows `DevNameScreen` when
  `import.meta.env.PROD && !OVERVIEW && !chosen`, and renders the office only after a choice
  (`signInDev(name)`), so `startNet` never joins as the fallback. `DevNamePicker` (the switch chip)
  is unchanged. Three new tests in `AuthGate.test.tsx` (`vi.stubEnv("PROD", true)`).
- What this means for Phase 6:
  - P6-A: check-in starts after this card, and home desks match people by display name
    (`ARCHITECTURE.md` 12.10). Anyone who types "Maya" gets Maya's desk. That is fine for the demo;
    say so in the report.
  - P6-B: invitees are picked from the people in the office. Their names are what visitors typed.
  - P6-E: the story starts at this card (Maya and Arjun pick their names), then check-in.
  - Lanes must not change `AuthGate.tsx` or `me.ts` without a request to the lead.

**Implemented since the plan was written (2026-11-04, `95e408f`): no ghost avatar on refresh**
- The owner saw several copies of themselves after refreshing. Cause, from Phase 2: a refreshed
  page drops its socket, and the room held the old player for the reconnect window
  (`RECONNECT_SECONDS`, 20 s) beside the new one. Measured live before the fix: 1, 2, 3 avatars
  after two quick refreshes, back to 1 after about 20 s.
- `apps/server/src/room/office.room.ts`: `onDrop` keeps each pending reconnection in `dropped`.
  `onJoin` calls `releaseDropped(userId)`, which rejects that person's pending reconnections
  (with `false`, exactly as the window's own timeout does), so `onLeave` removes the old player at
  once. Connected sessions are untouched: two tabs of one person, or two people who typed the
  same name, both stay.
- `apps/web/src/net/connection.ts`: `pagehide` makes a consented leave (`leaveOnPageHide`, which
  calls `stopNet`); `pageshow` from the back-forward cache joins again (`rejoinOnPageShow`).
- Tests: two room tests in `office.room.test.ts` (shown failing without the fix), four in
  `apps/web/src/net/pageLifecycle.test.ts`. Gotcha for room tests: rejecting a reconnection
  restarts Colyseus' 1 s auto-dispose timer. If a test ends before it fires, vitest's forks pool
  fails the file with "Unexpected call to process.send()", so such a test sleeps 1.5 s at the end.
- Verified live: three quick refreshes keep one avatar; closing a real browser tab removes it in
  0.6 s. A connection that dies without any goodbye (a crash, a lost network) still lingers for
  20 s, by design, so a blip can reconnect.

**Hosting accounts**

| Service | What exists | How to reach it |
|---|---|---|
| Fly.io | App `meta-virtual-office` in the owner's personal org ("Dibya Debashish Bhoi", slug `personal`). One machine in `sin`. `fly.toml` holds the name, region, `AUTH_MODE = "dev"` and `ALLOWED_ORIGINS`. | `flyctl` 0.5.2 in `%USERPROFILE%\.fly\bin` (on the user PATH for new shells; otherwise `~/.fly/bin/flyctl.exe`). Logged in on this machine. |
| Vercel | Project `meta-virtual-office` in team `debashish17s-projects`: Root Directory `apps/web`, Vite, Node 22.x, linked at the **repo root** (`.vercel/`, ignored). Production env: `VITE_SERVER_URL`, `VITE_AUTH_MODE` (`dev`), `VITE_API` (`http`), all non-sensitive. | `vercel` CLI, logged in as `debashish17`. Always run it from the repo root, not from `apps/web` as `DEPLOY.md` 2.1 says. |
| Supabase | Project `ubhkqklqkqaydjfyoten` (`https://ubhkqklqkqaydjfyoten.supabase.co`), auto-placed in **Frankfurt** (AWS eu-central-1). Both migrations applied; RLS on all 13 tables; no rows, no users. Auth signs with ES256, which `SupabaseAuth` verifies. **The live demo does not use it yet.** | The Supabase MCP in `.mcp.json` (project-scoped: approve it when a session starts in the repo root, authenticate once through `/mcp`). The Supabase CLI is not logged in and is not needed. |

**Region (measured, not guessed: the owner asked for that).** Connect times from the owner's
machine: Mumbai 0.09 s, Singapore 0.10 s, Frankfurt 0.22 s, US East 0.28 s. Fly no longer
provisions Mumbai (`bom`), so the server is in Singapore. The Supabase project is in Frankfurt, so
it does not match the server. That only matters for the full deploy; see decision 1 below.

**How to redeploy (needs the owner's OK each time)**
- Server, from the repo root:
  `~/.fly/bin/flyctl.exe deploy --build-arg GIT_COMMIT=$(git rev-parse --short HEAD) --ha=false --yes`.
  Then check `curl https://meta-virtual-office.fly.dev/health` for the new `version`.
- Web, from the repo root:
  1. `vercel pull --yes --environment=production`
  2. `vercel build --prod --yes`
  3. `vercel deploy --prebuilt --prod --yes`

  The build runs on this machine with the pulled env (`VITE_*` are baked in at build time); only
  `.vercel/output` is uploaded.
- After either: the two-player join check (the Node snippet in `DEPLOY.md` 1.2, run from
  `apps/web` with `new Client('https://meta-virtual-office.fly.dev')`), and the site opening in a
  browser.

**Lessons from the first deploy**
- Chain dependent host commands with `&&`. A clone to `bom` failed, and the next command still
  destroyed the only machine (about two minutes down).
- `.dockerignore` now keeps `.worktrees/` (1.6 GB), web assets, docs, test output and local env
  files out of the image's build context. Keep it that way.
- `fly deploy --image registry.fly.io/meta-virtual-office:<tag>` redeploys a built image without
  rebuilding (used for the region move and the CORS change).

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
- `ALLOWED_ORIGINS` in `fly.toml` already names both Vercel origins. A new web domain must be
  added there, then redeploy the server.

**Open owner decisions** (ask the owner; do not decide them yourself)
1. **D14, deploy mode.** Stay in fast mode for the deadline (recommended by the previous lead: it
   already runs the whole demo, with the least risk), or switch to the full deploy (real email and
   password sign-in, data kept in Postgres). If full: the owner creates a new Supabase project in
   **Singapore** (Dashboard, New project, region "Southeast Asia (Singapore)") so the database sits
   next to the server, and fills in `.env.hosted.local`. The steps are under "Full mode" below.
2. **Keep one machine always on for judging day** (`min_machines_running = 1` in `fly.toml`,
   roughly USD 2 a month): no cold start, and the in-memory demo data survives idle periods.
3. **Pushing `main`** to the remote: only when the owner asks. The owner asked on 2026-11-04 for
   `5a02fe6` and again for `9b0ae0d` and this update, each pushed as a fast-forward; each later
   push needs its own OK. Check `main...origin/main` first (state above).
4. **The live AI model: wired 2026-11-03 at the owner's request.** Fly holds `LLM_API_KEY` (from
   the root `.env`); `/health` says `llm: "meta"`: Muse Spark `muse-spark-1.3` through
   `https://api.meta.ai/v1`, reasoning effort `low` (defaults; `LLM_MODEL` is set nowhere). Checked
   on the live site: the Acme status question is answered with six sources (5 s), the CEO question
   abstains (3 s). **Known risk, accepted by the owner:** in two local runs, "Process meeting" on the
   Acme transcript (about 10 to 14 s) proposed the milestone change and the reassignment, but never
   the commitment update ("Go-live by 15 Nov" to 22 Nov); once it added the notice as a commitment
   instead of a task, once as both. Rehearse the meeting step on the live model. The fallback is
   one command (step 4 of "Live model" below). A fix worth a small package: keep the scripted
   `acme-sync` fixture meeting on `FixtureLlm` while questions and real transcripts use the model.
5. **LiveKit (calls, live captions):** no LiveKit project exists (the `LIVEKIT_*` names are empty
   locally and unset on Fly), so `/health` says `calls: "off"` and the office shows "Calls
   unavailable". It stays that way unless the owner creates a LiveKit Cloud project (decision D9);
   virtual meetings in P6-B are cut until then.

**What to do next, in order**
1. **P6-0 contract and slots** (lead agent; `WORK_PACKAGES.md` P6-0). Branch
   `wp/P6-0-contract` from the newest `main`. It includes the receipt contract for P6-R. Done
   when: checks pass, `e2e/demo.spec.ts` passes unchanged, and the office looks the same
   (screenshot). Merge it with `--no-ff`. Do this first and fast: every lane waits for it.
2. **Lanes, in parallel, once P6-0 is merged** (one agent each, own worktree, the lane prompt in
   section 6, ports from section 5):
   - P6-A status, home desks, four colleagues (slot lane 1);
   - P6-R receipts (USP A Phase 0) (slot lane 2);
   - P6-B meetings in the rooms (slot lane 3);
   - P6-C notes when an agent is free (slot lane 4).

   With fewer agents, the priority is P6-A, P6-R, P6-B, P6-C. P6-D only if P6-A and P6-B are
   merged and green by about 12:00 on 2026-11-04.
3. **The lead merges each lane** as its report comes in: rebase, checks, `e2e/demo.spec.ts`,
   merge `--no-ff`, mark the status board. After a merge that works, redeploy (with the owner's OK)
   so the live site follows `main`. Keep the previous image tag, to roll back with
   `fly deploy --image`.
4. **Feature freeze, 2026-11-04 between 15:00 and 16:00.** Unfinished cut-first tasks are dropped
   and reported (cut order in `IMPLEMENTATION_PLAN.md` 3.1). Then:
   1. final merge;
   2. `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:e2e`;
   3. redeploy;
   4. P6-E (the office-life story, then the Acme demo) and P4-C (the rehearsal: two devices,
      a reconnect, the LLM-unavailable case) on the public URL;
   5. the owner records the backup video (`docs/DEMO_VIDEO.md`);
   6. an hour of buffer before 21:00.
5. **After the deadline:** the final review (Phase 7, section 8), then the USP A plan's Phases 1
   to 4, each behind its gate and the owner's approval.

**Full mode (only if the owner chooses it in decision 1)**
1. The owner creates the Singapore Supabase project and gives the new project ref.
2. Point `.mcp.json` at the new ref (`claude mcp add --scope project ...` as before). The owner
   approves and authenticates the server in a new session in the repo root.
3. Apply both migrations through the MCP (`apply_migration`, named after the files). Check
   `pg_tables.rowsecurity` and `get_advisors`. Two low-risk warnings are already known, on the
   helper functions in `20261101000001_office_rls.sql`: `request_user_id` has no fixed
   `search_path`, and `is_workspace_member` can be called over RPC. Fix them in a new migration
   file in the repo, and apply that too.
4. The owner writes `.env.hosted.local` (names in "Rules for the hosted services" below). Seed:
   `node --env-file=.env.hosted.local supabase/seed.mjs`.
5. Fly: stage the secrets (`fly secrets import --stage`). In `fly.toml` set
   `AUTH_MODE = "supabase"` and add `NODE_ENV = "production"`; then redeploy.
6. Vercel: set `VITE_AUTH_MODE=supabase`, add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
   (the MCP's `get_publishable_keys`); rebuild and redeploy the web.
7. Verify: sign in as Maya and as Arjun in two browsers and run the Acme demo. Then delete or
   pause the Frankfurt project (the free plan allows two active projects).

**Live model (only if the owner approves decision 4)**
1. Check it locally first, because the live model's output is not fixed the way the fixture is.
   With the key in `.env`, run `pnpm dev` and walk the Acme demo in two browsers. "Process
   meeting" must propose the four changes the script expects: Go-live 15 Nov to 22 Nov, the
   commitment updated, the blocked task reassigned to Arjun, the new task "Notify Acme of new
   date". The status question must be answered with sources, and the CEO question must abstain.
   Note how long each call takes (the timeout is 30 s).
2. If that holds, set the secret on Fly without printing it, then restart with the current image:
   1. `grep '^LLM_API_KEY=' .env | ~/.fly/bin/flyctl.exe secrets import --stage -a meta-virtual-office`
   2. `~/.fly/bin/flyctl.exe deploy --image <current image tag> --ha=false --yes`
3. Check that `/health` says `llm: "meta"`, then run the Acme demo on the public URL.
4. To go back: `flyctl secrets unset LLM_API_KEY -a meta-virtual-office` gives `FixtureLlm` again.
   Keep the fixture as the fallback if the live run misses a change or is slow. Tests and e2e
   always run on `FixtureLlm`: never point them at the key.

**Prompt for the next lead agent** (copy as is)

> You are the lead agent for the Virtual Office repository at
> `C:\Users\devd9\muse-sandbox\meta-virtual`. Read `AGENTS.md`, then `docs/HANDOFF.md` section 0
> (start here), then `docs/IMPLEMENTATION_PLAN.md` section 3.1 and the Phase 6 packages in
> `docs/WORK_PACKAGES.md`, and `docs/ARCHITECTURE.md` 12.10. The deadline is 2026-11-04 at 21:00.
> The demo is live in fast mode; do not redeploy, change a hosted service or push without the
> owner's OK in this session. Ask the owner the open decisions in section 0 when a step needs them.
> Build P6-0 yourself on `wp/P6-0-contract`, merge it, then hand P6-A, P6-R, P6-B (and P6-C) to
> lane agents with the lane prompt in section 6. Keep the status board (section 7) current and
> `e2e/demo.spec.ts` unchanged and green after every merge. Stop and report at the feature freeze.

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
| D14 | Deploy mode (full, or the fast fallback) | Fast mode live since 2026-11-03; full mode not decided (needs a Supabase project in Singapore; section 0) |
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
| FIX first-visit name card (owner request) | lead | main (`644d96f`) | merged and deployed 2026-11-04: deployed dev-auth build asks "Who are you?" before joining; checks green, e2e 8/8, verified live with a fresh browser | section 0 |
| FIX refresh ghost avatars (owner report) | lead | main (`95e408f`) | merged and deployed 2026-11-04: the room replaces a person's dropped session on rejoin; the page leaves on `pagehide`; checks green, e2e 8/8, verified live | section 0 |
| P6-0 contract and slots | lead + builder/reviewer/e2e | wp/P6-0-contract | merged (--no-ff aed9532; 1 review must-fix fixed by lead with regression test) | P6-0.md |
| P6-A status, home desks, colleagues | builder/reviewer/e2e | wp/P6-A-status-desks | merged (--no-ff 0868819; reviewer PASS no must-fix; lead aligned offline Colleagues to 4 fefa8fc) | P6-A.md |
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

**2026-11-03 to 04, deploy, live AI, name card.** Fast-mode deploy (Vercel, Fly `sin` after a
measured region choice; the Supabase project sits in Frankfurt with both migrations applied),
the live model wired on Fly at the owner's request with the meeting-step risk recorded, and the
first-visit "Who are you?" card so visitors stop sharing the 'Maya' fallback. `main` pushed to
GitHub as a fast-forward (`5a02fe6`). Section 0 rewritten as the start-here notes for the next
lead, with its prompt.
