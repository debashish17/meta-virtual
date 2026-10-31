# Virtual Office

Real-time, fixed-isometric 3D office where meetings update shared operational
and customer records. Agents: read `AGENTS.md` first, then `docs/HANDOFF.md` (state, team
workflow), `docs/PROJECT_BRIEF.md`, `docs/ARCHITECTURE.md`, `docs/DESIGN_SPEC.md`,
`docs/IMPLEMENTATION_PLAN.md` (phases, gates) and `docs/WORK_PACKAGES.md` (the packages).

## Layout (M0)

```
apps/web          # React + R3F client (Vite). Current prototype lives here.
apps/server       # Colyseus room + HTTP API (one Node process, tsup build)
packages/shared   # world map, event types, Zod schemas, constants (@office/shared)
supabase/         # migrations + seed (lands in M4)
docs/             # brief, architecture, design spec, plan
```

`apps/web` and `apps/server` never import from each other; both depend on
`@office/shared` via `workspace:*`.

## Run locally

```sh
pnpm install
pnpm dev            # web on :5173 + server on :2567 (Turbo)
```

- Web: `http://localhost:5173/` is the office.
- Server health: `http://localhost:2567/health` returns the shared constant.
  The `office` Colyseus room is defined; clients join in M3.

## Commands (verified M0, Turbo)

```sh
pnpm build          # web dist + server dist bundle
pnpm typecheck
pnpm lint
pnpm test           # Vitest unit tests
node apps/server/dist/index.js   # run the built server (PORT env, default 2567)
```

`pnpm test:e2e` (Playwright, two-browser) lands in M3 and is not configured yet.

## Asset catalogue

The office kit is built from the reference boards by `blender-asset-pipeline/run.py`. The README
in that folder covers stages, inputs, outputs and review. To review builds and export
`reviews.json`, run `pnpm dev` and open `http://localhost:5173/assets/catalogue/review.html`.

## Office scene (M2)

Run `pnpm dev`, then open `http://localhost:5173/`: walk with WASD or the arrow
keys (Shift jogs), click the floor to walk there, click a free desk chair to sit and type or the
tea counter for a drink (E does either nearby), scroll to zoom, "Customise look" for your outfit.
`?view=overview` frames the whole floor. Colleagues and passers-by are scenery until M3 brings
real players. People are Mixamo characters: see the licence note in `AGENTS.md`.

## Services (M0: none configured)

Copy `.env.example` to `.env` when needed. Supabase, AI provider and hosting
are all unconfigured; names only, never commit values.
