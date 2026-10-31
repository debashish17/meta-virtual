# AGENTS.md — Rules for the coding agents

Read this file first, every session. Then read, in order:
1. `docs/HANDOFF.md`: current state, how the agents work together, setup quirks.
2. `docs/PROJECT_BRIEF.md`, `docs/ARCHITECTURE.md` (section 12 settles the designs the packages share), `docs/DESIGN_SPEC.md`.
3. `docs/IMPLEMENTATION_PLAN.md`: phases, gates, owner decisions.
4. Your work package in `docs/WORK_PACKAGES.md`.

> Filename note: `AGENTS.md` is a common convention for agent instructions. If your agent loads instructions from a different filename or settings location, copy this content there.

## 1. What this project is

Virtual Office: a real-time, fixed-isometric 3D office where a team's meetings update shared operational and customer records, and anyone can ask the office what is happening ("my day", "status of project X", "what's going on with Acme") and get a cited answer.

The visual authority is `docs/reference/office-reference.png`. Do not substitute another aesthetic (no pixel art, no game-style assets, no cartoon outlines).

## 2. Operating mode: work packages with checkpoints

Work is split into work packages (`docs/WORK_PACKAGES.md`) grouped in phases that end at gates (`docs/IMPLEMENTATION_PLAN.md`). Several agents may work at once, each on its own package, branch and git worktree (`docs/HANDOFF.md` section 5).

You may, without asking:
- Create, edit and delete files that your work package owns (its "Owns" list).
- Install the project's dependencies with pnpm (`pnpm install`) and Playwright's browser (`npx playwright install chromium`).
- Run builds, linters, unit and e2e tests, the local dev servers and the local Supabase.
- Reset the **local** database (`pnpm db:reset`), when you are the agent the plan allows to.
- Make small commits on your package's branch.

You must stop and report before:
- Changing anything listed under "Locked decisions" (section 4).
- Adding a dependency, a new service, a paid tool or an external account.
- Editing a file your package does not own, or a shared contract (`packages/shared/src/{net,api,sim,demo}`) after Gate P1. Write it as a request in your report.
- Running destructive database commands (drop, truncate, reset) against any non-local database.
- Deploying anything publicly, or changing a hosted service's settings.
- Changing or deleting tests to make them pass.
- Starting another package, or the next phase.
- Merging into `main` (only the lead merges).

Never:
- Print, log or commit secrets. Only `.env.example` (placeholders) is committed.
- Silently reduce scope, skip a failing test, or mark a task done when its acceptance criteria are not met.
- Rewrite files unrelated to the current task.
- Invent facts in AI outputs (see section 6).
- Force-push, or rewrite the history of `main`.

## 3. Repository layout

```
meta-virtual/                      # the pnpm workspace "virtual-office"
├── AGENTS.md
├── README.md
├── .env.example
├── docs/
│   ├── PROJECT_BRIEF.md, ARCHITECTURE.md, DESIGN_SPEC.md
│   ├── IMPLEMENTATION_PLAN.md, WORK_PACKAGES.md, HANDOFF.md
│   ├── reports/                   # one report per work package
│   ├── reference/                 # office-reference.png and the asset boards (never modify)
│   └── screenshots/
├── apps/
│   ├── web/                       # React + R3F client (Vite)
│   │   ├── src/office/            # the scene: OfficeScene, Avatar, Person, Colleagues, Hud, ...
│   │   ├── scripts/               # screenshot.mjs, people/bake.mjs
│   │   └── public/assets/         # catalogue/ (kit GLBs, review sheet), models/, people/, sprites/
│   └── server/                    # Colyseus room + HTTP API (one Node process)
├── packages/
│   └── shared/                    # @office/shared: world, layouts, catalogue, people, and from P1-A net, api, sim, demo
├── blender-asset-pipeline/        # builds the furniture kit (Python + Blender); not needed for M3 to M6
└── supabase/                      # config, migrations, seed (from P1-B / P2-C)
```

Rules:
- Code that both client and server need (map, zones, obstacles, movement, people logic, message and record schemas, demo data) lives in `packages/shared`. Never duplicate it.
- `apps/web` and `apps/server` never import from each other.
- The client never decides final positions (it predicts, the server decides), never talks to the LLM, and never holds service keys.
- `packages/shared` imports nothing from `three`, `react`, `@react-three/*` or the DOM: the server bundles it. A lint rule enforces this from P1-B.
- Designs that several packages share (movement sync, rooms, auth, database access, the LLM adapter, deployment) are fixed in `docs/ARCHITECTURE.md` section 12. Do not re-decide them inside a package; file a request if one does not fit.
- One reusable component per furniture type; placements come from data in `packages/shared`.

## 4. Locked decisions (do not change without the owner's approval)

- Package manager: pnpm workspaces. Turborepo for task running.
- Language: TypeScript, strict mode, everywhere (Python only in `blender-asset-pipeline/`).
- Client: React, Vite, Three.js, React Three Fiber, Drei, Zustand.
- Camera: fixed orthographic isometric angle. It follows the local avatar with wheel zoom (`DESIGN_SPEC.md` section 2). No orbit, no rotation, no free camera, no first person.
- Scene: procedural architecture (floor, walls, glass, windows, city) plus the GLB furniture kit built by `blender-asset-pipeline/` from the reference boards and approved on the review sheet. People are the Mixamo characters baked by `apps/web/scripts/people/bake.mjs`. No other asset sources. (Updated 2026-11-01 to record what the owner asked for during M1 and M2; it replaces "procedural geometry, GLB only for small props".)
- Multiplayer: Colyseus 0.18 (`@colyseus/core` on the server, `@colyseus/sdk` on the client). Server-authoritative movement at a fixed tick.
- Validation: Zod schemas in `packages/shared`, used for socket messages, HTTP bodies and LLM output.
- Data: Supabase Postgres, with row-level security on every table that holds workspace data.
- AI writes to records only through approved `proposed_changes`. No autonomous writes.
- Tests: Vitest for unit and integration, Playwright for e2e.
- No physics engine.
- Live meetings (LiveKit: voice, video, screen share, the transcript of a real meeting) come only after the memory demo passes, as the optional Phase 5 (decision D9); the fixture demo must keep working without them. GitHub, calendar and the snippet pad stay out of scope.

## 5. Commands

Verified on the owner's machine (Windows 11, Node 22.22, pnpm 12.8.1). Lines marked *(P1-B)* arrive with work package P1-B, which verifies them and removes the mark.

```bash
pnpm install
pnpm dev            # web + server together (web :5173, server :2567)
pnpm build
pnpm lint
pnpm typecheck
pnpm test           # unit tests (Vitest)
pnpm test:e2e       # two-browser tests (Playwright)            (P1-B)
pnpm db:start       # local Supabase in Docker                  (P1-B)
pnpm db:reset       # local only: migrations + seed             (P1-B)
pnpm db:stop        #                                           (P1-B)
```

Ports come from env so several agents can run the app at once *(P1-B)*: `WEB_PORT`, `PORT` (server), `VITE_SERVER_URL`, `CHROME_DEBUG_PORT` (screenshot script). Slot numbers are in `docs/HANDOFF.md` section 5.

URLs (default ports):
- **Office** (the app's only page): `http://localhost:5173/`. Walk with WASD or arrows (Shift jogs), click to walk, click a desk chair to sit or the tea counter for a drink (E nearby), scroll to zoom. `?view=overview` frames the whole floor.
- **Server health:** `http://localhost:2567/health`.
- **Asset library review sheet** (approve builds, export `reviews.json`): `http://localhost:5173/assets/catalogue/review.html`, also linked from the office in development.

**Screenshot** (needs `pnpm dev`):
`pnpm --filter @office/web screenshot -- --url "<url>" --out <file.png> [--before "__officeDebug.teleport(x, z)"]`
- Renders at 1440 x 810. `--before` runs in the page once the scene is ready.
- Headless Chrome renders in software, so measure frame rate in a normal browser.

Asset pipeline (Windows, Blender 5.2, Python 3.11+; see `blender-asset-pipeline/README.md`). Not needed for M3 to M6:

```bash
python blender-asset-pipeline/run.py catalog   # board labels -> catalogue (fails on unused corrections)
python blender-asset-pipeline/run.py build     # catalogue parts -> GLBs, thumbnails, QA, review sheet
python blender-asset-pipeline/run.py qa        # re-score builds and apply data/reviews.json
python blender-asset-pipeline/run.py test      # pipeline unit tests
```

**People** (Mixamo characters and moves): downloaded by the owner from mixamo.com. The raw FBX files are not kept in the repo; ask the owner for them before re-baking.
- Command: `node apps/web/scripts/people/bake.mjs --src <folder with Ch13/Ch23/Ch33_nonPBR.fbx and the move FBX files listed in bake.html>`.
- It writes `apps/web/public/assets/people/` (one GLB per character, `moves.glb`, `LICENSE.txt`) and `packages/shared/src/people/bodies.generated.json`.
- Licence: Mixamo's terms forbid redistributing the files on their own. Keep the repository (and any remote) private, or leave `apps/web/public/assets/people/` out of any public copy. Using them inside the deployed app is the intended use (as a game ships its assets); ask the owner if a use looks like redistribution.

## 6. AI behaviour rules (product code)

- All LLM calls go through the `LlmClient` interface in `apps/server`. Provider, model and key come from env.
- Every LLM response is validated with Zod. On failure: retry once with the validation error, then fall back (plain summary or "could not extract").
- Answers to "ask the office" use only retrieved records. Every claim carries source record IDs, and cited IDs must exist in the retrieved set.
- If no relevant record exists, the answer is an explicit "I don't have a record of that". Never guess.
- A deterministic `FixtureLlm` must exist so the demo and tests work with no network and no API key.
- Never log API keys, tokens, or prompts that contain workspace records.

## 7. Definition of done for a work package

1. Every acceptance item of the package in `docs/WORK_PACKAGES.md` is met.
2. `pnpm typecheck`, `pnpm lint` and `pnpm test` pass, and `pnpm test:e2e` too if the package has e2e tests.
3. The app runs (`pnpm dev`) and the changed behaviour was exercised.
4. For visual work: a screenshot was captured and compared with the reference.
5. Only files the package owns were changed (or the exceptions were approved by the lead).
6. Changes are committed on the package's branch with clear messages.
7. The report is written to `docs/reports/<ID>.md`.

## 8. Checkpoint report format

At the end of each work package (in `docs/reports/<ID>.md`) and at each gate (to the owner):

```
Work package / gate: <ID and name>
Status: passed | blocked | partial
Done: <bullets>
Evidence: <test output summary, screenshot paths, commands run>
Deviations: <anything that differs from the plan, and why>
Files changed outside "Owns": <none, or list with reason>
Requests: <contract changes, dependencies, files owned by others>
How to verify: <commands, URLs>
Open questions: <decisions needed from the owner or the lead>
Next: <what is unblocked by this; not started>
```

## 9. Working style

- Prefer the smallest change that satisfies the criteria.
- Keep files small and named by responsibility.
- Write tests first for movement, collision, validation, extraction and approval logic.
- If the reference image and the written spec disagree, the image wins. Report the discrepancy.
- If blocked for more than a short attempt, stop and report instead of working around the problem.
- Windows quirks (heredocs in Git Bash, Vite serving stale modules, throttled DevTools windows) are listed in `docs/HANDOFF.md` section 4. Read them before you lose an hour to one.
