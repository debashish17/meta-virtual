# WORK_PACKAGES.md

The work for M3 to M6, and the optional live meetings after them, cut into packages that separate
agents can build at the same time. Read
`AGENTS.md`, `docs/HANDOFF.md` and `docs/IMPLEMENTATION_PLAN.md` first; this file is the detail.

**How to read a package**

- **Depends on:** packages that must be merged into `main` before this one starts.
- **Owns:** the only paths this package may create or change. Anything else (another package's
  files, a shared contract, a new dependency) is a request to the lead, written in your report
  (`docs/HANDOFF.md` section 5). Tests live next to the code they test and belong to the same package.
- **Size:** S about half a day of agent work, M about a day, L about two days. Rough guides only.
- **Acceptance:** what the lead checks before merging. "Checks pass" always means
  `pnpm typecheck`, `pnpm lint` and `pnpm test` from the repo root.

Rules for every package:

- Write the tests first for logic: movement, validation, extraction, approval and ask.
- Parse every socket message and HTTP body with the schemas in `packages/shared` (`src/net`,
  `src/api`). Do not declare a payload type anywhere else.
- Keep the office working with no server running (offline mode). It is how the scene is reviewed,
  and the app must not go blank while the server is restarting.
- Read `docs/ARCHITECTURE.md` section 12 before starting. It settles the designs that several lanes
  share (movement sync, the room registry, auth, database access, the LLM adapter, deployment).
  A package that needs to depart from it files a request; it does not improvise.
- `packages/shared` imports nothing from `three`, `react`, `@react-three/*` or the DOM: the server
  bundles it. P1-B adds the lint rule.
- The web's mock API and the real HTTP API are held to one contract test suite (P1-C writes it
  against the mock; P3-C runs it against the server).
- When done: commit on your branch, write `docs/reports/<ID>.md` (format in `AGENTS.md` section 8), stop.
  The lead merges.

---

## Phase 1: Foundations

Two or three agents. The lead runs P1-A then P1-C; a second agent runs P1-B at the same time.
With a third agent, P1-A is split by folder into P1-A1 and P1-A2 (below), which shortens Phase 1
by about a day.

### P1-A Contracts and shared simulation [L] (lead; splittable)

**Goal:** everything the Phase 2 lanes must agree on exists in `packages/shared`, tested, before
any lane starts.

**Depends on:** nothing.

**Owns:** `packages/shared/src/{net,api,sim,demo,people}/**`, `packages/shared/src/index.ts`,
`apps/web/src/office/{routine,interactions,moves}.ts` and their tests (moved out),
the import lines of `apps/web/src/office/{Avatar,Colleagues,Person}.tsx`, `docs/ARCHITECTURE.md` sections 4 and 5.

**Split (optional):** **P1-A1** (lead) owns `net`, `sim`, `people`, the web import lines and the
`ARCHITECTURE.md` update (tasks 1, 2, 3, 6). **P1-A2** owns `api` and `demo` (tasks 4, 5). They
share nothing but `packages/shared/src/index.ts`, where each adds its own export line. Both merge
before P1-C.

**Tasks**

1. **Socket contract** (`src/net/`), Zod schemas with inferred types, all `.strict()`:
   - `JoinOptions = { protocol: number; displayName: string (1 to 40, trimmed); workspaceId: string; look: AvatarLook }`
     and the constant `PROTOCOL_VERSION`. The access token is not in the options: the SDK carries
     it as `client.auth.token` and the server reads it in `static onAuth`. `workspaceId` is only
     the matchmaking key; authorization comes from the token (`ARCHITECTURE.md` 12.2, 12.3).
   - `AuthClaims = { userId; name; workspaceId }`: what a verified token resolves to. The server's
     `AuthVerifier` returns it and the `Repo` takes it on every call.
   - Client to server:

     | Message | Payload |
     |---|---|
     | `move_intent` | `{ seq; dx: -1\|0\|1; dz: -1\|0\|1; run: boolean }` (world axes) |
     | `move_target` | `{ seq; x; z }` |
     | `activity_start` | `{ seq; targetId }` (a desk seat id `seat:x,z` or a counter spot id) |
     | `activity_stop` | `{ seq }` |
     | `chat_send` | `{ text }` (1 to 500 characters after trimming) |
     | `status_set` | `{ status: "available" \| "in_meeting" \| "away" }` |
     | `look_set` | `{ look: AvatarLook }` |

   - Server to client: `chat`, `chat_history` (last 50 on join), `zone_event`, `records_changed`
     (`{ kinds: RecordKind[] }`), and
     `error { code: "invalid_message" | "rate_limited" | "unwalkable" | "target_taken" | "unauthorized" | "protocol_mismatch"; message }`.
   - Synced state as plain types (the server's Colyseus schema must mirror them, field for field):
     `PlayerView = { id; userId; name; look; x; z; facing; pose: Pose; speed; activity: { kind: "seat" | "counter"; targetId } | null; status; zoneId: string | null; lastSeq }`
     and `NpcView = { id; name; look; x; z; facing; pose; speed }`.
   - Constants: `TICK_HZ = 20`, `INTERP_DELAY_MS = 100`, `SNAP_DISTANCE = 0.3` (m; a bigger change
     between two ticks is a jump, never smoothed), move rate limit 30 messages a second, chat 5 per
     10 seconds, `RECONNECT_SECONDS = 20`, proximity enter 3 m and leave 4 m.
   - `seq` counts the client's ticks; the server's `lastSeq` is the seq of the last input it
     applied for that player (`ARCHITECTURE.md` 12.1). Document both in the schema file.
   - `screenToIntent(sx, sy)`: the camera's screen directions map exactly onto world axes
     (screen up = (+1, -1), screen right = (+1, +1)). Test it.
2. **Shared simulation** (`src/sim/`): `stepPlayer(player, input, dt)`, the one movement function
   that the server (authority) and the client (prediction) both run, at fixed `1 / TICK_HZ` steps.
   It normalises the intent, clamps speed (walk 2.3 m/s; jog `WalkMap.MAX_SPEED`), moves through
   `OFFICE_WALK.step`, follows a `findPath` route for a target, turns the facing, and sets pose
   (stand, walk, jog) and speed. While an activity is running, the activity code moves the player
   instead (task 3).
   Tests: walls, glass and furniture are never crossed; no input exceeds the maximum speed; the
   same inputs always give the same result; any intent combination stays in range.
3. **Move the pure people logic** from `apps/web/src/office/` into `packages/shared/src/people/`:
   `routine.ts`, `interactions.ts` (rename to `activity.ts`), `moves.ts` (`secondsOf`, `riseOf`), and the `Pose`
   type (from `Person.tsx`).
   - `TAKEN` stops being a module-level set: reservations are passed in as a `Set<string>`, because
     the server keeps one per room. The web keeps its own set for offline mode.
   - Move the tests with the code, changing import paths only.
   - The office must look and behave exactly as before: take screenshots before and after.
4. **HTTP contract** (`src/api/`):
   - Records: Account, Contact, Project, Milestone, Task, Commitment, Meeting.
   - `ProposedChange`, with:
     - `type`: `milestone_date | commitment_update | commitment_create | task_create | task_update | task_reassign`;
     - `status`: pending, approved or rejected;
     - `before` and `after`, `needsReview`, `targetId` (null when no record matched), `sourceMeetingId`.
   - `ExtractionResult` (`ARCHITECTURE.md` section 7).
   - `DayItem` and `MyDay`, `ProjectStatus`, `AccountStatus`.
   - `AskRequest` and `AskResult` (`ARCHITECTURE.md` section 5).
   - `MeetingCreate = { zoneId; transcript } | { zoneId; fixture: "acme-sync" }`, and `RecordKind`.
   - Add `GET /proposed-changes?status=pending&meetingId=` (the approval drawer's list) to the
     endpoint table.
5. **Demo data** (`src/demo/`), the single source for `seed.sql` (P2-C), `FixtureLlm` (P2-D) and the
   web's mock API (P1-C):
   - People and records: the Northwind workspace, Maya and Arjun identified by `key` (`maya`,
     `arjun`; the database assigns their ids, `ARCHITECTURE.md` 12.4), the Acme account and a
     contact, the project, the milestone "Go-live" (2026-11-15), the three tasks and the commitment
     (`PROJECT_BRIEF.md` section 5). Records carry stable UUIDs, used by the in-memory repo, the
     mock API and the seed alike; owners are referenced by `key`.
   - `ROOM_RECORDS`: which account or project each room shows on its wall and processes meetings
     for (`acme_room`: Acme Corp; `project_room`: Acme Payments Integration).
   - The meeting transcript (fixture `acme-sync`) and the four proposed changes it must produce:
     - milestone 15 Nov to 22 Nov;
     - commitment "Go-live by 22 Nov";
     - "Fix webhook signature validation" reassigned to Arjun;
     - new task "Notify Acme of new date" for Maya.
   - The two demo questions and their expected outcomes (an answer citing sources; an abstention).
   - Test that every item parses with its schema.
6. Update `docs/ARCHITECTURE.md` sections 4 and 5 to this contract and list what changed.

**Acceptance:**
- Checks pass.
- Before and after screenshots match: colleagues still walk, sit down and stand up.
- Every new schema has a test with at least one valid and one invalid case.

### P1-B Tooling for parallel work [M]

**Goal:** several agents can build, run and test side by side; no later package needs to touch the lockfile.

**Depends on:** nothing (runs alongside P1-A).

**Owns:** root `package.json`, `turbo.json`, `pnpm-lock.yaml`, `apps/*/package.json`,
`packages/shared/package.json`, `.env.example`, `playwright.config.ts`, `e2e/**`, `supabase/config.toml`,
`apps/web/vite.config.ts` (ports and env only), `apps/web/scripts/screenshot.mjs` (port only),
`AGENTS.md` section 5, the commands in `README.md`.

**Tasks**

1. **Install now every dependency the later packages need**, and verify current versions:
   - web: `@colyseus/sdk` (the 0.18 line, matching `@colyseus/core` 0.18; not the old `colyseus.js`)
     and `@supabase/supabase-js`;
   - web dev: `jsdom` and `@testing-library/react`, for P2-F's component tests;
   - server: `postgres` (postgres.js), `jose`, `@supabase/supabase-js` and `openai` (OpenAI's SDK,
     used for the Meta Model API; decision D5);
   - server dev: `@colyseus/testing` (the 0.18 line), for P2-A's room tests;
   - root dev: `@playwright/test` and `supabase` (the CLI). Then `npx playwright install chromium`
     once per machine (documented in `README.md`, not a dependency).

   Seen on 2026-11-01: `@colyseus/sdk` 0.18.9, `@colyseus/testing` 0.18.6, `openai` 7.47.0,
   `@supabase/supabase-js` 2.118, `supabase` 2.122, `postgres` 4.0, `jose` 6.2, `@playwright/test` 1.64.
   Record the versions you installed in the report.
2. **Ports from env**, so two stacks can run at once:
   - `WEB_PORT` (default 5173), `PORT` (server, default 2567) and `VITE_SERVER_URL`;
   - `CHROME_DEBUG_PORT` for `screenshot.mjs` (default 9341).
3. **Playwright**: `pnpm test:e2e`.
   - Starts web and server through `webServer` on the e2e ports (`WEB_PORT=5190`, `PORT=2590`),
     with `reuseExistingServer` outside CI, so it never collides with an agent's dev stack.
   - Runs headless Chromium.
   - Includes a two-users helper (`e2e/helpers/twoUsers.ts`, two browser contexts).
   - Includes one smoke test: the office reaches `window.__officeReady` in both contexts.
4. **Local Supabase** (Docker Desktop is installed on the owner's machine):
   - `supabase init` config;
   - root scripts `pnpm db:start`, `pnpm db:stop`, `pnpm db:reset` (local only: `supabase db reset`
     for the migrations, then `pnpm db:seed`) and `pnpm db:seed` (`supabase/seed.mjs`: creates the
     demo users through the Auth Admin API with the local service role key, then every row from
     the shared demo data with the ids it got back; P2-C writes it, P1-B leaves a stub that prints
     what it will do).
   - Do not create a hosted project.
5. **`.env.example` names** (no values): `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWKS_URL` or `SUPABASE_JWT_SECRET` (whichever the
   CLI version signs with; verify), `AUTH_MODE` (`dev` | `supabase`), `ALLOWED_ORIGINS`, `LLM_PROVIDER`,
   `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`, `WEB_PORT`, `PORT`, `VITE_SERVER_URL`, `VITE_SUPABASE_URL`,
   `VITE_SUPABASE_ANON_KEY`, `VITE_AUTH_MODE`, `VITE_API` (`mock` | `http`).
6. Update `AGENTS.md` section 5 and `README.md` with the verified commands.
7. ESLint for `packages/shared`: `no-restricted-imports` for `three`, `react`, `react-dom` and
   `@react-three/*`, and `no-restricted-globals` for `window` and `document`, so the server can
   always bundle it.
8. Vitest: the web config keeps the node environment; component tests opt in per file with
   `// @vitest-environment jsdom`.

**Acceptance:**
- `pnpm test:e2e` passes the smoke test.
- Two dev stacks run at once on different ports.
- `pnpm db:start` then `pnpm db:reset` work locally, or the blocker (for example, Docker not
  running) is reported.
- Checks pass.

### P1-C App skeletons and slots [M] (lead, after P1-A)

**Goal:** every Phase 2 lane gets its own folder and an already-mounted slot, so no lane edits the
entry files that everyone shares.

**Depends on:** P1-A.

**Owns:**
- server: `apps/server/src/index.ts`, `apps/server/src/{server,deps,env}.ts`, the stub files under
  `apps/server/src/{room,http,db,llm,meetings,ask,status,auth}/`;
- web: `apps/web/src/office/OfficeScene.tsx`, `apps/web/src/App.tsx`,
  `apps/web/src/net/store.ts`, `apps/web/src/api/{types,mock,index,records,contract}.ts`, and the four slot files below.

**Tasks**

1. **Server**:
   - `createServer(deps)` in `src/server.ts` (Express plus Colyseus), used by `index.ts` and by tests.
   - `src/env.ts`: the environment parsed with Zod at startup. A missing or invalid value stops
     the server with the variable's name (never its value). `AUTH_MODE=dev` is refused when
     `NODE_ENV=production`.
   - `httpRoutes(app, deps)` from `src/http/routes.ts`, with only `/health`, which returns
     `{ ok, version, authMode, llm }` (`version` from `GIT_COMMIT` or the package version).
   - The room stub: `src/room/schema.ts` with Colyseus schema classes mirroring `PlayerView` and
     `NpcView` (plus a test that the field names equal the types' keys), and
     `src/room/office.room.ts`, which validates `JoinOptions`, checks `protocol`, adds a player at
     `WORLD.spawn` and removes them on leave. No tick and no messages yet: P2-A adds those. This is
     what P2-B connects to until P2-A merges.
   - `deps = { repo, llm, auth, bus, chat }`, built from env in `src/deps.ts`, with these
     interface files (types plus the simplest working implementation):
     - `src/db/repo.ts`: the `Repo` interface: record reads for my day, status and ask; meetings;
       proposed changes; `approveChange` and `rejectChange` (one transaction each); audit; chat;
       membership. An in-memory implementation over the shared demo data, used until P2-C lands.
     - `src/llm/types.ts`: `LlmClient { extractMeeting(transcript, context); answer(question, records) }`.
       It returns raw (unvalidated) output; validation belongs to the pipelines.
     - `src/auth/verify.ts`: `AuthVerifier.verify(token?) -> { userId; name; workspaceId }`, and
       `DevAuth` for `AUTH_MODE=dev`, which refuses to start when `NODE_ENV=production`.
     - `src/room/bus.ts`: `RoomBus.recordsChanged(workspaceId, kinds)`.
     - `src/room/chat.ts`: `ChatStore`, with an in-memory implementation.
2. **Web**:
   - **Slots**, each mounted once and rendering nothing yet:
     - `net/Players.tsx` and `office/displays/WallDisplays.tsx` inside the canvas in `OfficeScene.tsx`;
     - `ui/Panels.tsx` next to `<Hud />`;
     - `auth/AuthGate.tsx` wrapping the app in `App.tsx`, passing its children straight through
       until P3-C adds sign-in.
   - **Net store contract** (`net/store.ts`), a Zustand store:
     - `status`: `offline | connecting | online | reconnecting`;
     - `selfId`;
     - `players: Record<id, PlayerView>` and `npcs`;
     - `chat: ChatMessage[]`;
     - `send: { chat(text), status(s) }` (no-ops until P2-B fills them in).
   - **API**:
     - `api/types.ts`: the `OfficeApi` interface (`myDay`, `projectStatus`, `accountStatus`,
       `listPending`, `processMeeting`, `approve`, `reject`, `ask`, `meeting`).
     - `api/mock.ts`: an in-memory implementation over the shared demo data; approve and reject
       change the mock records; ask answers the two demo questions.
     - `api/index.ts`: uses the mock unless `VITE_API=http`.
     - `api/records.ts`: a Zustand store with what the panels and displays show (`myDay`,
       `pending`, `project`, `account`, `meeting`), `load()` and `refetch(kinds)`. The net store
       calls `refetch` on `records_changed` (P2-B wires that).
     - `api/contract.ts`: a test suite written against `OfficeApi` (process the fixture meeting
       gives four pending changes; approve three and reject one, then my day and the statuses
       reflect it; the two ask outcomes). `mock.contract.test.ts` runs it here; P3-C runs it
       against the server.
3. **Tests**:
   - `createServer()` boots in a test and `/health` answers.
   - The contract suite passes against the mock.

**Acceptance:**
- The office looks and behaves unchanged.
- Checks pass.
- `pnpm dev` runs.

**Gate P1** (lead, owner informed): contracts reviewed, P1-B works, all three packages merged. Phase 2 may start.

---

## Phase 2: Parallel lanes (up to seven agents)

All seven depend only on Phase 1 and own separate folders, so they can run at the same time. With
fewer agents, see the groupings in `docs/HANDOFF.md` section 6.

### P2-A Office room server [L]

**Depends on:** P1-A, P1-C. **Owns:** `apps/server/src/room/**`.

**Tasks**

1. The schema classes from P1-C's stub stay the mirror of `PlayerView` and `NpcView`; keep the
   test that the field names equal the types' keys.
2. `static onAuth(token, options, context)` verifies the token through `AuthVerifier` (the SDK sends
   `client.auth.token`). `onJoin` validates `JoinOptions`, checks `protocol`, refuses a
   `workspaceId` that is not the token's (`define("office", OfficeRoom).filterBy(["workspaceId"])`
   makes one room per workspace), spawns at `WORLD.spawn` (or the nearest free walkable point) and
   sends `chat_history`. `onCreate` registers the room in `rooms.ts` (`Map<workspaceId, OfficeRoom>`);
   `onDispose` removes it (`ARCHITECTURE.md` 12.2).
3. A fixed tick (`setSimulationInterval`, `1000 / TICK_HZ`; `setPatchRate` the same) running
   `stepPlayer` with each player's latest `move_intent` or `move_target`. It sets `lastSeq` (the seq
   of the input it applied), pose and speed, and `zoneId`, sending `zone_event` on change.
4. Activities, with one reservation set per room (P3-A adds the colleagues to it):
   - `activity_start` checks that the target is a known desk seat or counter spot and is not reserved.
   - The tick runs the shared activity code.
   - A movement message or `activity_stop` ends it, by standing up first, as in the office today.
   - Leaving releases the reservation.
5. Validation and limits:
   - Every message is parsed; anything invalid gets `error invalid_message` and is ignored.
   - Per-connection rate limits; unwalkable targets are rejected.
   - No message can set a position.
6. Reconnect with `allowReconnection(RECONNECT_SECONDS)`; the player and their reservation are kept
   during the window.
7. Chat through `ChatStore`. Implement `RoomBus`: look the workspace's room up in the registry and
   broadcast `records_changed`.
8. Tests, written first, with `@colyseus/testing` (boot the server inside Vitest and drive it with
   `@colyseus/sdk`, so every test goes over a real socket):
   - tampering: an out-of-range `dx`, NaN, extra fields, a flood (rate limited), a target inside a wall;
   - speed stays clamped over 10 s;
   - walls are never crossed;
   - two clients see each other;
   - reconnecting restores state;
   - a seat one player holds cannot be taken by another.

**Acceptance:** G3 "a tampered client cannot teleport or pass through walls" and "reconnect restores
state" are proven by tests. Checks pass.

### P2-B Web networking and remote people [L]

**Depends on:** P1-A, P1-B, P1-C to start (P1-C's stub room accepts joins and holds the state
shape); P2-A to finish (movement and the e2e test need the real room). Rebase when P2-A merges.

**Owns:** `apps/web/src/net/**` (except the store's shape), `apps/web/src/office/Avatar.tsx`,
`apps/web/src/office/me.ts`, `e2e/multiplayer.spec.ts`.

**Tasks**

1. **Connection** (`net/connection.ts`):
   - `@colyseus/sdk` to `VITE_SERVER_URL`; the token in `client.auth.token` (`dev:<name>` until
     P3-C; never in the join options); join `office` with `JoinOptions` (name and look from
     `me.ts`, `PROTOCOL_VERSION`, `WORKSPACE_ID`).
   - Reconnect with backoff: keep `room.reconnectionToken`, call `client.reconnect(token)`.
   - Subscribe to state with `getStateCallbacks(room)` from `@colyseus/sdk`.
   - Status goes into the net store.
   - With no server the office stays single-player, exactly as today.
2. **Local avatar**:
   - Held keys send `move_intent` at `TICK_HZ`, plus once on release. A floor click sends `move_target`.
   - A chair or counter click, or E, sends `activity_start`; moving or E sends `activity_stop`.
   - Predict with `stepPlayer` at fixed ticks (the same `1 / TICK_HZ` as the server), render
     between ticks, and keep a ring buffer of the predicted position per `seq`.
   - Reconcile on each snapshot without replaying inputs (`ARCHITECTURE.md` 12.1): the error is
     the server position minus the predicted position at the snapshot's `lastSeq`; below
     `SNAP_DISTANCE` it is added to the current prediction over about 100 ms, above it the avatar
     snaps. Unit-test this with a fake server that lags by a few ticks: no correction when the
     simulations agree; a snap when the server rejects a move.
   - During an activity, draw the local avatar from server snapshots (interpolated) instead of predicting.
3. **Remote players** (`net/Players.tsx`, in its slot):
   - One `Person` per player with a snapshot buffer of `INTERP_DELAY_MS`.
   - Pose changes step with the snapshots. Position jumps (more than `SNAP_DISTANCE` between
     snapshots, as in sitting down and standing up) snap rather than slide, so `Person`'s cut lines up.
   - Name pills.
4. A look change sends `look_set`.
5. A dev hook `window.__officeNet` (players and positions) for tests.
6. e2e: two contexts join, see each other's name pill, one walks, and the other sees it move.

**Acceptance:**
- G3 "two browsers see each other move smoothly" passes locally (after P2-A is merged).
- Offline mode is unchanged.
- Frame rate with 2 players and 9 colleagues is reported from a real browser (target 60 fps).

### P2-C Database [L]

**Depends on:** P1-A, P1-B, P1-C. **Owns:** `supabase/**`, `apps/server/src/db/**`.

**Tasks**

1. Migrations for every table in `ARCHITECTURE.md` section 6:
   - `workspace_id` on every workspace row;
   - `source_meeting_id` on records the AI creates or changes;
   - foreign keys, indexes, and enums for the statuses.
2. Row-level security on every workspace table (`ARCHITECTURE.md` 12.4): `profiles` and
   `memberships` first, then a `SELECT` policy for members on every workspace table, and no write
   policies for `authenticated`. Record writes happen only in the server, after its own membership
   checks.
3. The seed, `supabase/seed.mjs` (`pnpm db:seed`): create Maya and Arjun through the Auth Admin API
   with the service role key and local test passwords (documented, local only, never real ones),
   then insert profiles, memberships and the Acme records from `@office/shared` demo data with the
   returned ids. A test checks that the seeded rows match the shared demo data. The same script
   seeds the hosted project in P4-A.
4. A `Repo` implementation on postgres.js (`prepare: false` when `DATABASE_URL` is a
   transaction-mode pooler):
   - `withUser(claims, fn)`: a transaction that runs `SET LOCAL ROLE authenticated` and sets
     `request.jwt.claims`, so RLS applies to the server's reads; every read goes through it.
   - `withService(fn)`: a transaction under the connection's own role, used only by the writes,
     each of which checks membership first and names `workspace_id` in every statement.
   - `approveChange(id, claims)`: lock the row (`FOR UPDATE`); it must be pending; apply it per
     change type; write an `audit_log` row with before and after; mark it approved. Not pending
     gives a typed conflict error (P3-B turns it into 409).
   - `rejectChange`, which also writes an audit row.
   - Reads for my day, status and ask; meetings; chat messages; membership lookup.
5. Tests against local Supabase (each test creates its own workspace and removes it):
   - workspace isolation: with claims for a user of A, reads of B's rows return nothing (through
     `withUser`); if `SET ROLE authenticated` turns out not to be possible for the connection's
     role, prove it with supabase-js (anon key plus a user's JWT) instead and say so in the report;
   - approving applies the change and writes audit rows;
   - a second approval of the same change is rejected;
   - rejecting leaves records unchanged.

**Acceptance:** G4 "approving changes updates the records and writes audit rows" and "RLS test
proves workspace isolation". Checks pass, with the database tests runnable with one command.

### P2-D LLM client and meeting pipeline [M]

**Depends on:** P1-A, P1-C. **Owns:** `apps/server/src/llm/**`, `apps/server/src/meetings/**`.

**Tasks**

1. **`FixtureLlm`**, deterministic:
   - The `acme-sync` transcript gives the `ExtractionResult` that maps to the four expected changes.
   - Any other transcript gives a summary-only result.
   - `answer` calls a function passed to the constructor. Until P3-B wires in P2-E's
     `fixtureAnswer` (in `deps.ts`), that function abstains.
2. **The real adapter** (`ARCHITECTURE.md` 12.5; owner decision D5: Muse Spark): OpenAI's SDK
   (`openai`) pointed at the Meta Model API, chosen by `LLM_PROVIDER=meta`, base URL from
   `LLM_BASE_URL` (default `https://api.meta.ai/v1`), model from `LLM_MODEL` (default
   `muse-spark-1.3`), key from `LLM_API_KEY`.
   - Chat Completions, with the reply requested as JSON in the shared schema's shape
     (`response_format` with `z.toJSONSchema(<shared schema>)` if the API accepts it, otherwise the
     schema in the system prompt), reasoning effort `low`, `timeout: 30_000`, `maxRetries: 1`. The
     result still goes through the pipeline's own Zod validation.
   - Before relying on them, check with one real call each and record in the report: whether a
     JSON-schema `response_format` is accepted, the reasoning-effort parameter's name and values,
     and how long an extraction at `low` takes. This needs the owner's key in the server's `.env`;
     without it, report the three as unverified.
   - It never logs keys, and logs prompts or outputs that contain records only at debug level.
     Without a key the server uses `FixtureLlm` and says so on `/health`.
3. **Pipeline**: validate with Zod; on failure retry once with the validation error; then fall back to
   a summary-only result with a "could not extract" notice.
4. **Mapping** `ExtractionResult` to `ProposedChange[]` against a records snapshot, as a pure function.
   The meeting's room gives the account or project (`ROOM_RECORDS`), which narrows the matching.
   Match by name and context; when nothing matches confidently, set `targetId` to null and
   `needsReview` to true.
5. **Tests**:
   - the fixture gives exactly the four expected changes (types, before and after);
   - invalid JSON is retried, then falls back;
   - an unknown owner name gives `needsReview`;
   - with no key, `FixtureLlm` is used.

**Acceptance:** G4 "running the fixture transcript produces the expected proposed changes" and
"with no LLM key, everything still works through FixtureLlm" (for extraction). Checks pass.

### P2-E Ask the office and status queries [M]

**Depends on:** P1-A, P1-C. **Owns:** `apps/server/src/ask/**`, `apps/server/src/status/**`.

**Tasks**

1. Status builders (pure, over `Repo` reads):
   - `myDay(user)`: items, each with a reason;
   - `projectStatus(id)`;
   - `accountStatus(id)`.
2. **Ask**:
   - Classify the question as `my_day`, `project_status`, `account_status`, `decision_history`
     or `other`: rules first (project and account names, "my day"), then the LLM only if needed.
   - Retrieve the matching records.
   - If nothing was retrieved, or the class is `other`, abstain with the fixed message.
   - Otherwise call `llm.answer` with only the retrieved records, expecting `{ answer, sourceIds }`.
   - Every `sourceId` must be in the retrieved set, or abstain. Resolve the source labels.
3. **`fixtureAnswer(question, records)`** in `ask/fixtureAnswer.ts`: builds the answer from the
   retrieved records, so after approval it says 22 Nov. `FixtureLlm` (P2-D) calls it.
4. **Tests** with an in-memory `Repo`:
   - the status question cites records that exist;
   - the CEO question abstains;
   - an answer that cites an unknown ID abstains;
   - after the demo changes are applied, the answer reflects the new date.

**Acceptance:** G4 "`/ask` returns a cited answer for the demo status question and abstains for the
unsupported one" at function level. Checks pass.

### P2-F Product panels [L]

**Depends on:** P1-C.

**Owns:** `apps/web/src/ui/**`, `apps/web/src/office/Hud.tsx`, `apps/web/src/office/office.css`,
the position of `apps/web/src/office/LookEditor.tsx`.

**Tasks** (layout from `DESIGN_SPEC.md` section 9)

1. **Panels**:
   - participants (top-left, from the net store);
   - chat (bottom-left);
   - ask (bottom-centre, expanding upwards);
   - My day (right drawer);
   - the approval drawer (right; replaces My day when changes are pending): before and after,
     approve and reject, a "needs review" state, and a refresh when an approval conflicts.
2. **Meetings**: a "Process meeting" action shown while you are in the Acme room (zone from
   `useOfficeUi`), and the meeting summary view.
3. **Feedback**: notices for fixture mode, reconnecting and errors. Ask results show sources, or the
   "no record" state.
4. **Layout**:
   - Move the control hint and "Customise look" so nothing overlaps.
   - Keep the centre of the scene clear.
   - Typing in any input must never move the avatar.
5. Read through the `records` store (which uses `api`: the mock until P3-C) and the net store;
   never call `fetch` directly. Disable "Process meeting", approve and reject while their request
   is pending, so a double click cannot submit twice.

**Acceptance:**
- Against the mock API in one browser: process the meeting, approve three changes and reject one;
  My day and ask then show the result.
- A 1440 x 810 screenshot with the panels open, centre clear.
- Checks pass.

### P2-G Wall displays [M]

**Depends on:** P1-C. **Owns:** `apps/web/src/office/displays/**`.

**Tasks**

1. Canvas-texture screens on the TV displays in `acme_room` and `project_room`. Find them in
   `packages/shared/src/world/office.ts`; do not move furniture.
   - Acme room: deal stage, the commitment and the next milestone.
   - Project room: milestones, blocked tasks and owners.
2. Redraw only when the data changes.
3. Clicking a screen opens a larger DOM overlay with the same content.
4. Data comes from `api` (the mock for now).

**Acceptance:**
- Readable at the walking zoom.
- Screenshots of both rooms.
- No frame-rate drop in a real browser (report the number).

---

## Phase 3: Integration

P3-A, P3-B and P3-D can run at the same time. P3-C can start against the contract and finishes
after P3-B. P3-E comes last.

### P3-A Shared colleagues [M]

**Depends on:** P2-A, P2-B.

**Owns:** `apps/server/src/room/npcs.ts` (and its schema file), `apps/web/src/office/Colleagues.tsx`.

**Tasks** (owner decision D6; the default is to keep colleagues and run them on the server)

1. Run the shared colleague routines on the server tick, using the room's reservation set, which
   players use too. Sync them as `NpcView`.
2. Online, the client draws them like remote players and stops running its own routines. Offline,
   it keeps them as today.
3. A preset whose name matches a signed-in player (Maya, Arjun) is not spawned as a colleague.

**Acceptance:**
- Two browsers see the same colleagues in the same places.
- A player and a colleague never hold the same seat (test).

### P3-B HTTP API, auth and live updates [L]

**Depends on:** P2-A, P2-C, P2-D, P2-E.

**Owns:** `apps/server/src/http/**`, `apps/server/src/auth/**`, `apps/server/src/deps.ts`.

**Tasks**

1. **Endpoints**: everything in `ARCHITECTURE.md` section 5, plus the pending list, each with Zod
   bodies and responses. `/health` fills in `version`, `authMode` and `llm`. In `deps.ts`, build the real `Repo` (P2-C), its database chat store,
   `FixtureLlm` with P2-E's `fixtureAnswer` (or the real adapter when a key is set), and the auth
   verifier.
2. **Auth** (`ARCHITECTURE.md` 12.3): verify Supabase JWTs with `jose`, HS256 with
   `SUPABASE_JWT_SECRET` (the local CLI) or the project's JWKS (hosted), then look up membership
   to get the workspace and the name, cached for a few seconds. The room join verifies the same
   token when `AUTH_MODE=supabase`. Both modes produce `AuthClaims`.
3. **Limits**: CORS from `ALLOWED_ORIGINS`; rate limits per user.
4. **Approve**:
   - the repo transaction runs first;
   - after commit, `bus.recordsChanged`;
   - a change that is no longer pending returns 409.
5. **Reject**, with an audit row.
6. **`POST /meetings`**: runs the pipeline and persists the meeting and its proposed changes.
7. Chat is persisted to `chat_messages`.
8. Integration tests against local Supabase.

**Acceptance:** every G4 item, proven by tests, plus a short `curl` session in the report. Checks pass.

### P3-C Web data wiring and sign-in [M]

**Depends on:** P2-B, P2-F, P2-G; finishing needs P3-B.

**Owns:** `apps/web/src/api/http.ts`, `apps/web/src/auth/**` (including `AuthGate.tsx`), the token handling in `apps/web/src/net/connection.ts`.

**Tasks**

1. `AuthGate`: with `VITE_AUTH_MODE=dev` a name picker (no network), otherwise a sign-in screen
   ("Join as Maya" / "Join as Arjun") through Supabase Auth with the seeded local test users;
   deployed, an email and password form.
2. The token goes to every HTTP call as the bearer header and to the room as `client.auth.token`;
   a refreshed token is used on the next reconnect.
3. On `records_changed`, refetch the affected queries, so panels and wall displays update without a reload.
4. Loading, error and reconnecting states.
5. `api/http.contract.test.ts`: the contract suite from P1-C against the running local stack,
   skipped unless `E2E_STACK=1`.

**Acceptance:**
- G5 "the second user's view updates live after approval", locally.
- The contract suite passes against the server.
- Checks pass.

### P3-D Deployment smoke test [S] (needs owner approval and hosting, decision D3)

**Depends on:** P2-A, P2-B.

**Owns:** deploy configuration (`Dockerfile`, host config such as `fly.toml`, `render.yaml` or
`vercel.json`), `docs/DEPLOY.md`.

**Tasks**

1. Server (`ARCHITECTURE.md` 12.7): a `Dockerfile` (Node 22, pnpm through corepack,
   `pnpm install --frozen-lockfile`, `pnpm --filter @office/server build`, which bundles
   `@office/shared`, `CMD node apps/server/dist/index.js`), `/health` as the health check, `PORT`
   from the host, `ALLOWED_ORIGINS` set to the web URL. Deploy it to the WebSocket host.
2. Web: build with `VITE_SERVER_URL=https://<server>` (the SDK upgrades to WebSocket itself),
   `VITE_AUTH_MODE=dev` and `VITE_API=mock` for this smoke test, output `apps/web/dist`; deploy it
   to the static host. Then the server's `ALLOWED_ORIGINS` gets the real web URL.
3. Confirm two browsers on the public URL see each other.
4. Secrets go only in the hosts' settings.

**Acceptance:** G3 "a public URL connects to the deployed server", or the blocker is reported.

### P3-E The demo, end to end [M]

**Depends on:** P3-B, P3-C (P3-A optional). **Owns:** `e2e/demo.spec.ts`, additions under `e2e/helpers/`.

**Tasks**

1. Playwright runs the demo script from `PROJECT_BRIEF.md` section 5 in two contexts, against the
   local stack with `FixtureLlm`:
   - both join;
   - the Acme wall display shows the status;
   - process the meeting;
   - approve three changes, reject one;
   - Arjun's view updates live;
   - the status question gets a cited answer;
   - the CEO question abstains.
2. Also check that the rejected change left its record untouched, and that a reload restores the state.

**Acceptance:** every G5 item. `pnpm test:e2e` passes.

---

## Phase 4: Deploy, harden, rehearse

### P4-A Production deploy [M] (owner approval for every deploy)

**Depends on:** Phase 3, plus a hosted Supabase project (decision D4).

**Tasks**

1. Apply the migrations and the demo seed to the hosted project.
2. Deploy the server and web with production env: CORS, `AUTH_MODE=supabase`, the Supabase
   redirect URLs.
3. Run the e2e demo against the deployed URL.

### P4-B Hardening [M]

**Depends on:** Phase 3.

**Tasks**

1. `pnpm demo:reset` restores the demo in one command: local freely; hosted only with approval.
   Restart the server afterwards so rooms drop their state; clients reconnect and refetch.
2. Performance pass: pixel-ratio cap, shadow cost, instancing. Report numbers from a real browser.
3. Check the notices for fixture mode, reconnecting and errors.
4. `README.md`: setup, deployment and known limitations.
5. The steps for the backup demo video (the owner records it).

### P4-C Rehearsal [S] (owner and agent)

Two devices or networks, a reconnect, and the LLM-unavailable case (key unset). Results go in the report.

**Gate G6** closes Phase 4. Then Phase 5 if time permits, and Phase 6, the final review.

---

## Phase 5: Live meetings (optional; after G6; decision D9)

Voice, video and screen share in the meeting rooms, and the transcript of a real meeting into the
memory pipeline, with LiveKit (`ARCHITECTURE.md` 12.9). This phase runs only if time permits after
Gate G6, with the owner's go-ahead. Otherwise the demo uses the fixture transcript (the static
demo), which must keep working unchanged whether or not this phase ships. P5-A and P5-B run in
parallel; P5-C needs both; P5-D closes the phase.

### P5-A Call service [M]

**Depends on:** Phase 4; decision D9 (a LiveKit Cloud project, with its URL, API key and secret in
the server's env only).

**Owns:** `apps/server/src/calls/**`, the `/calls` lines of `apps/server/src/http/routes.ts`, the
`LIVEKIT_*` names in `.env.example` and `apps/server/src/env.ts`, the `calls` field of `/health`.
The `CallTokenRequest` schema in `packages/shared/src/api` is added by the lead.

**Tasks**

1. `POST /calls/token { zoneId }`:
   - the caller must be in that zone right now according to the office room (look the player up
     through the room registry; the client's claim is not trusted), and the zone's type must be
     `meeting_room`, `customer_room` or `project_room`;
   - the LiveKit room is `${workspaceId}--${zoneId}`; the identity is the user id, the name the
     display name;
   - the token (`livekit-server-sdk`, `AccessToken`) grants join, publish and subscribe for that
     one room, with a one-hour TTL; the response is `{ url, token }`;
   - rate limited per user.
2. With no `LIVEKIT_*` set, the endpoint answers 503 `calls_off` and `/health` reports
   `calls: "off"`; the office works as before.
3. Tests: in the room gives a token whose grants decode to that room only; another zone, the open
   plan, or not connected gives 403; no keys gives 503.

**Acceptance:** G7 "tokens are issued only for the room the player is in" is proven by tests.
Checks pass.

### P5-B Call UI [L]

**Depends on:** Phase 4 to start; P5-A to finish.

**Owns:** `apps/web/src/calls/**`, a `<CallPanel />` slot line in `apps/web/src/ui/Panels.tsx`,
`apps/web/src/office/displays/LiveShare.tsx`, `e2e/calls.spec.ts`.

**Tasks**

1. Join and leave follow the avatar: entering a meeting-room zone (the net store's zone) asks the
   server for a token and connects (`livekit-client`, `Room`); leaving the zone disconnects. The
   first join asks for the microphone; if it is denied, the person is in the call listen-only with
   a notice, never blocked. (The browser needs a user gesture before it plays audio; walking there
   is one.)
2. A call bar (mute, camera, screen share, leave) and tiles for the participants' cameras in the
   right drawer area, collapsible, never over the centre of the floor (`DESIGN_SPEC.md` section 9).
   While in a call the player's status is `in_meeting`.
3. A shared screen is drawn on the room's wall display (a `VideoTexture` on the existing display
   mesh; `LiveShare.tsx` beside P2-G's status displays); clicking it opens the larger overlay.
4. If LiveKit cannot be reached, the bar says "Calls unavailable" and nothing else changes.
5. e2e: two contexts (Chromium with `--use-fake-ui-for-media-stream` and
   `--use-fake-device-for-media-stream`, `permissions: ["microphone", "camera"]`) walk into the
   Acme room and each sees the other's tile; one leaves the room and its tile disappears.

**Acceptance:** G7 "two browsers in the Acme room hear and see each other; a shared screen shows
on the wall display", and microphone denied gives listen-only. The frame rate during a call is
reported from a real browser. Checks pass.

### P5-C Transcript from the call [M]

**Depends on:** P5-A, P5-B.

**Owns:** `apps/web/src/calls/captions/**`, `apps/server/src/calls/transcript.ts`,
`e2e/live-meeting.spec.ts`. The `caption_send` and `caption` messages in `packages/shared/src/net`
are added by the lead.

**Tasks**

1. Captions in the browser with the Web Speech API (`SpeechRecognition`, continuous, interim
   results; Chrome). Each participant's own speech becomes caption segments sent as
   `caption_send { text, final, ts }` over the office room. The server broadcasts `caption` to the
   people in that zone and appends final segments, with the speaker's name, to a transcript buffer
   per zone.
2. "End meeting" in the call bar (or the last participant leaving) posts the assembled transcript
   to `POST /meetings` with the zone, so the existing pipeline proposes the changes. An empty
   buffer gives the notice "no speech was captured" instead of a meeting.
3. Paste a transcript: the same panel accepts pasted text for `POST /meetings`. This is the
   no-microphone route, and it stays for the static demo.
4. e2e (fake media): captions sent through the room arrive at the other participant; ending the
   meeting with a seeded transcript yields the pending changes in the drawer.

If the browser route is not good enough, the upgrade is a LiveKit agent worker with a
speech-to-text provider (`IMPLEMENTATION_PLAN.md` section 7). That is a new account and a second
process; the owner decides.

**Acceptance:** G7 "a transcript captured from a live call produces proposed changes through the
same pipeline". Checks pass.

### P5-D Live-meeting rehearsal [S] (owner and agent)

The demo script with step 3 done live: Maya and Arjun hold the meeting in the Acme room, end it,
and approve the proposed changes. Then the same script on the fixture transcript, to prove the
fallback. Both on the deployed app, with the microphone-denied case. The results, and the owner's
choice of which version to show, go in the report.

**Gate G7** closes Phase 5.

---

## Phase 6: Final review

The reviewer's checklist is `docs/HANDOFF.md` section 8.
