# AGENTS.md — Rules for the coding agent (Muse)

Read this file first, every session. Then read `docs/PROJECT_BRIEF.md`, `docs/ARCHITECTURE.md`, `docs/DESIGN_SPEC.md` and `docs/IMPLEMENTATION_PLAN.md`, in that order.

> Filename note: `AGENTS.md` is a common convention for agent instructions. If Muse loads instructions from a different filename or settings location, copy this content there.

## 1. What this project is

Virtual Office: a real-time, fixed-isometric 3D office where a team's meetings update shared operational and customer records, and anyone can ask the office what is happening ("my day", "status of project X", "what's going on with Acme") and get a cited answer.

The visual authority is `docs/reference/office-reference.png`. Do not substitute another aesthetic (no pixel art, no game-style assets, no cartoon outlines).

## 2. Operating mode: autonomous with checkpoints

You may, without asking:
- Create, edit and delete files inside this repository to complete the current milestone.
- Install project dependencies with pnpm.
- Run builds, linters, unit tests and the local dev servers.
- Make small commits on a feature branch.

You must stop and report before:
- Changing anything listed under "Locked decisions" (section 4).
- Adding a new service, paid dependency or external account.
- Running destructive database commands (drop, truncate, reset against any non-local database).
- Deploying anything publicly.
- Changing or deleting tests to make them pass.
- Starting the next milestone (each milestone ends at a gate in `docs/IMPLEMENTATION_PLAN.md`).

Never:
- Print, log or commit secrets. Only `.env.example` (placeholders) is committed.
- Silently reduce scope, skip a failing test, or mark a task done when its acceptance criteria are not met.
- Rewrite files unrelated to the current task.
- Invent facts in AI outputs (see section 6).

## 3. Repository layout

```
virtual-office/
├── AGENTS.md
├── README.md
├── .env.example
├── docs/                      # brief, architecture, design spec, plan, reference image
├── apps/
│   ├── web/                   # React + R3F client (Vite)
│   └── server/                # Colyseus room + HTTP API (one Node process)
├── packages/
│   └── shared/                # world map, event types, Zod schemas, constants
└── supabase/
    ├── migrations/
    └── seed.sql
```

Rules:
- Code that both client and server need (map, zones, obstacles, event payloads, schemas) lives in `packages/shared`. Never duplicate it.
- The client never decides final positions and never talks to the LLM or holds service keys.
- One reusable component per furniture type; placements come from data in `packages/shared`.

## 4. Locked decisions (do not change without approval)

- Package manager: pnpm workspaces. Turborepo for task running.
- Language: TypeScript, strict mode, everywhere.
- Client: React, Vite, Three.js, React Three Fiber, Drei, Zustand.
- Camera: fixed orthographic, no orbit, no free camera, no first person.
- Scene: procedural geometry (boxes, simple meshes). GLB assets only for small props and only if procedural is clearly insufficient.
- Multiplayer: Colyseus. Server-authoritative movement.
- Validation: Zod schemas in `packages/shared`, used for socket messages, HTTP bodies and LLM output.
- Data: Supabase Postgres, with row-level security on every table that holds workspace data.
- AI writes to records only through approved `proposed_changes`. No autonomous writes.
- No physics engine.
- Voice (LiveKit), GitHub, calendar, screen share and the snippet pad are out of scope until the memory demo passes.

## 5. Commands

Commands below are the intended ones. During bootstrap, verify each against the real tool versions and update this section and `README.md` if they differ.

```bash
pnpm install
pnpm dev            # web + server together
pnpm build
pnpm lint
pnpm typecheck
pnpm test           # unit tests (Vitest)
pnpm test:e2e       # two-browser tests (Playwright)
```

Asset pipeline (Windows, Blender 5.2, Python 3.11+; see `blender-asset-pipeline/README.md`):

```bash
python blender-asset-pipeline/run.py catalog   # board labels -> catalogue (fails on unused corrections)
python blender-asset-pipeline/run.py build     # catalogue parts -> GLBs, thumbnails, QA, review sheet
python blender-asset-pipeline/run.py qa        # re-score builds and apply data/reviews.json
python blender-asset-pipeline/run.py test      # pipeline unit tests
```

Catalogue gallery (parts, layouts, references): `pnpm dev`, then `http://localhost:5173/?mode=catalogue`.
Office scene: `http://localhost:5173/?mode=office` (walk with WASD / arrows, click to walk, scroll to zoom;
`&view=overview` frames the whole floor). Screenshot (needs `pnpm dev`):
`pnpm --filter @office/web screenshot -- --url "<url>" --out <file.png> [--before "__officeDebug.teleport(x, z)"]`
(1440 x 810; `--before` runs in the page once the scene is ready; headless Chrome renders in software, so measure
frame rate in a normal browser).
People (Mixamo characters and moves, downloaded by the owner from mixamo.com; the raw FBX files are not kept in the repo):
`node apps/web/scripts/people/bake.mjs --src <folder with Ch13/Ch23/Ch33_nonPBR.fbx and the move FBX files>` writes
`apps/web/public/assets/people/` (one GLB per character, moves.glb, LICENSE.txt) and
`packages/shared/src/people/bodies.generated.json`. Mixamo's terms forbid redistributing the files on their own:
keep the repository private, or leave `apps/web/public/assets/people/` out of any public copy.

## 6. AI behaviour rules (product code)

- All LLM calls go through the `LlmClient` interface in `apps/server`. Provider and key come from env.
- Every LLM response is validated with Zod. On failure: retry once with the validation error, then fall back (plain summary or "could not extract").
- Answers to "ask the office" use only retrieved records. Every claim carries source record IDs, and cited IDs must exist in the retrieved set.
- If no relevant record exists, the answer is an explicit "I don't have a record of that". Never guess.
- A deterministic `FixtureLlm` must exist so the demo and tests work with no network and no API key.

## 7. Definition of done for any task

1. Acceptance criteria in `docs/IMPLEMENTATION_PLAN.md` are met.
2. `pnpm typecheck`, `pnpm lint` and relevant tests pass.
3. The app runs (`pnpm dev`) and the changed behaviour was exercised.
4. For visual work: a screenshot was captured and compared with the reference.
5. Changes are committed with a clear message.

## 8. Checkpoint report format

At the end of each milestone, reply with:

```
Milestone: <name>
Status: passed | blocked | partial
Done: <bullets>
Evidence: <test output summary, screenshot paths, commands run>
Deviations: <anything that differs from the plan, and why>
Open questions: <decisions needed from the owner>
Next: <the next milestone, not started>
```

## 9. Working style

- Prefer the smallest change that satisfies the criteria.
- Keep files small and named by responsibility.
- Write tests first for movement, collision, validation, extraction and approval logic.
- If the reference image and the written spec disagree, the image wins. Report the discrepancy.
- If blocked for more than a short attempt, stop and report instead of working around the problem.
