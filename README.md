# Virtual Office

Real-time, fixed-isometric 3D office where a team's meetings update shared
operational and customer records. Anyone can ask the office what is happening
("my day", "status of project X", "what's going on with Acme") and get an
answer that cites its records — or an honest "I don't have a record of that".

Agents: read `AGENTS.md` first, then `docs/HANDOFF.md` (state, team workflow),
`docs/PROJECT_BRIEF.md`, `docs/ARCHITECTURE.md`, `docs/DESIGN_SPEC.md`,
`docs/IMPLEMENTATION_PLAN.md` (phases, gates) and `docs/WORK_PACKAGES.md`.

## Layout

```
apps/web          # React + R3F client (Vite)
apps/server       # Colyseus room + HTTP API (one Node process, tsup build)
packages/shared   # world map, sim, Zod schemas, demo data (@office/shared)
supabase/         # migrations + seed
docs/             # brief, architecture, design spec, plan, deploy, demo video
scripts/          # demo:reset
```

`apps/web` and `apps/server` never import from each other; both depend on
`@office/shared` via `workspace:*`.

## Setup from scratch

Needs: Node 22, pnpm 12.8.1, Docker Desktop (local Supabase), and Chrome or
Chromium (screenshots, e2e). Several agents can run the app at once on
different ports (`WEB_PORT`, `PORT`, `VITE_SERVER_URL`, `CHROME_DEBUG_PORT`;
slots in `docs/HANDOFF.md` section 5).

```sh
pnpm install
npx playwright install chromium   # once per machine, for pnpm test:e2e
pnpm db:start       # local Supabase in Docker (first run pulls ~1 GB of images)
pnpm demo:reset     # migrations + seed (Maya, Arjun, the Acme records); prints the server-restart hint
pnpm dev            # web on :5173 + server on :2567 (Turbo)
```

Then open two windows (two profiles side by side for the demo):

- Maya: `http://localhost:5173/?name=Maya`
- Arjun: `http://localhost:5173/?name=Arjun`

Server health: `http://localhost:2567/health` (reports version, auth mode and
LLM — `fixture` when no key is set — and nothing secret).

Panels read the in-memory mock API by default ("Demo data" notice). For the
server-backed demo: `VITE_API=http pnpm dev` (dev sign-in, fixture AI unless
`LLM_API_KEY` is set on the server). The demo script is `docs/PROJECT_BRIEF.md`
section 5; the backup-video runbook is `docs/DEMO_VIDEO.md`.

## Commands

```sh
pnpm dev            # web on :5173 + server on :2567 (WEB_PORT/PORT to move)
pnpm build          # web dist + server dist bundle
pnpm typecheck
pnpm lint
pnpm test           # Vitest unit tests
pnpm test:e2e       # Playwright, two browsers, on :5190/:2590
pnpm db:start       # local Supabase in Docker (needs Docker running)
pnpm db:stop        # stop local Supabase
pnpm db:reset       # local only: migrations + seed
pnpm db:seed        # local only: demo users + rows (idempotent, safe to re-run)
pnpm demo:reset           # local: db:reset in one command, then the restart hint
pnpm demo:reset -- --dry-run        # print the steps without running them
node apps/server/dist/index.js   # run the built server (PORT env, default 2567)
```

`pnpm demo:reset --target=hosted` wipes + reseeds the demo workspace on the
linked Supabase project instead — and refuses unless `SUPABASE_URL`,
`DATABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` all point at hosted (never
localhost) and `DEMO_RESET_CONFIRM` equals the Supabase host exactly. After
any reset, restart the server so rooms drop their in-memory state, then reload
the browsers (they rejoin fresh and refetch). The script never kills processes
and never prints secrets. See `scripts/demo-reset.mjs --help`.

## Deployment

See `docs/DEPLOY.md`: web as static `apps/web/dist` on Vercel, the server as
one long-lived container on Fly.io (Colyseus needs a persistent process).
Secrets live only in the hosts' settings — never in chat, logs or git.

## The office

Walk with WASD or the arrow keys (Shift jogs), click the floor to walk there,
click a free desk chair to sit and type or the tea counter for a drink (E does
either nearby), scroll to zoom, "Customise look" for your outfit.
`?view=overview` frames the whole floor. The name picker offers Maya and
Arjun locally; `?name=` skips it.

Screenshots (needs `pnpm dev`):

```sh
pnpm --filter @office/web screenshot -- --url "<url>" --out <file.png>
```

## Known limitations

- **No GPU, no frame rate.** Headless Chrome renders in software (SwiftShader):
  on a 4-vCPU box the walking view runs at about 0.3 fps at 1440 x 810 (0.8 at
  640 x 360; DevTools-driven windows run about 1 fps when hidden) and needs
  roughly a minute to load. These numbers say nothing about a real browser —
  measure frame rate in a normal, visible browser on a machine with a GPU.
  The renderer is already capped where the plan asked (pixel ratio ≤ 2,
  static shadow map, instanced furniture): the P4-B report has the measured
  numbers and the methodology.
- **Slow-box e2e bounds.** With two software-rendered pages on one box the
  e2e waits are schedule bounds, not product behaviour: the first page needs
  ~70 s to reach ready, the second ~230 s while the first renders, remote
  pills up to ~190 s after online, and the full two-browser demo ~5 min
  inside a 15 min budget. A multiplayer timeout here is contention until
  proven otherwise.
- **Dev sign-in cannot read the database.** `dev:<name>` ids have no
  membership rows, so with `AUTH_MODE=dev` plus `DATABASE_URL` every record
  read comes back empty ("unknown account …"). Until the lead fixes that,
  run the server without `DATABASE_URL` (the deterministic in-memory demo
  data, which is also what the e2e demo uses) or sign in through Supabase
  Auth. Deployed (`AUTH_MODE=supabase`) is unaffected.
- **Fixture AI unless a key is set.** Without `LLM_API_KEY` the server
  answers from the deterministic fixture (the "Fixture AI" notice); the demo
  is built to pass that way.
- **People assets are private.** The Mixamo characters under
  `apps/web/public/assets/people/` may not be redistributed on their own: keep
  the repository (and any remote) private — see `AGENTS.md` section 5.
