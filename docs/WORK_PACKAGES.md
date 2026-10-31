# WORK_PACKAGES.md

The work for M3 to M6, cut into packages that separate agents can build at the same time. Read
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
- When done: commit on your branch, write `docs/reports/<ID>.md` (format in `AGENTS.md` section 8), stop.
  The lead merges.

---

## Phase 1: Foundations

Two agents: the lead runs P1-A then P1-C; a second agent runs P1-B at the same time.

### P1-A Contracts and shared simulation [L] (lead)

**Goal:** everything the Phase 2 lanes must agree on exists in `packages/shared`, tested, before
any lane starts.

**Depends on:** nothing.

**Owns:** `packages/shared/src/{net,api,sim,demo,people}/**`, `packages/shared/src/index.ts`,
`apps/web/src/office/{routine,interactions,moves}.ts` and their tests (moved out),
the import lines of `apps/web/src/office/{Avatar,Colleagues,Person}.tsx`, `docs/ARCHITECTURE.md` sections 4 and 5.

**Tasks**

1. **Socket contract** (`src/net/`), Zod schemas with inferred types, all `.strict()`:
   - `JoinOptions = { displayName: string (1 to 40, trimmed); look: AvatarLook; accessToken?: string }`.
     The workspace comes from the token (in dev auth: `WORKSPACE_ID`), never from the client.
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
     `error { code: "invalid_message" | "rate_limited" | "unwalkable" | "target_taken" | "unauthorized"; message }`.
   - Synced state as plain types (the server's Colyseus schema must mirror them, field for field):
     `PlayerView = { id; userId; name; look; x; z; facing; pose: Pose; speed; activity: { kind: "seat" | "counter"; targetId } | null; status; zoneId: string | null; lastSeq }`
     and `NpcView = { id; name; look; x; z; facing; pose; speed }`.
   - Constants: `TICK_HZ = 20`, `INTERP_DELAY_MS = 100`, `SNAP_DISTANCE = 0.3` (m; a bigger change
     between two ticks is a jump, never smoothed), move rate limit 30 messages a second, chat 5 per
     10 seconds, `RECONNECT_SECONDS = 20`, proximity enter 3 m and leave 4 m.
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
   - People and records: the Northwind workspace, Maya and Arjun with stable UUIDs, the Acme
     account and a contact, the project, the milestone "Go-live" (2026-11-15), the three tasks and
     the commitment (`PROJECT_BRIEF.md` section 5).
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
   - server: `postgres` (postgres.js), `jose` and `@supabase/supabase-js`;
   - root dev: `@playwright/test` and `supabase` (the CLI).

   Record the versions in the report.
2. **Ports from env**, so two stacks can run at once:
   - `WEB_PORT` (default 5173), `PORT` (server, default 2567) and `VITE_SERVER_URL`;
   - `CHROME_DEBUG_PORT` for `screenshot.mjs` (default 9341).
3. **Playwright**: `pnpm test:e2e`.
   - Starts web and server through `webServer`, using the env ports.
   - Runs headless Chromium.
   - Includes a two-users helper (`e2e/helpers/twoUsers.ts`, two browser contexts).
   - Includes one smoke test: the office reaches `window.__officeReady` in both contexts.
4. **Local Supabase** (Docker Desktop is installed on the owner's machine):
   - `supabase init` config;
   - root scripts `pnpm db:start`, `pnpm db:stop` and `pnpm db:reset` (local only: migrations plus seed).
   - Do not create a hosted project.
5. **`.env.example` names** (no values): `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWKS_URL` or `SUPABASE_JWT_SECRET` (whichever the
   CLI version signs with; verify), `AUTH_MODE` (`dev` | `supabase`), `ALLOWED_ORIGINS`, `LLM_PROVIDER`,
   `LLM_API_KEY`, `LLM_MODEL`, `WEB_PORT`, `PORT`, `VITE_SERVER_URL`, `VITE_SUPABASE_URL`,
   `VITE_SUPABASE_ANON_KEY`, `VITE_AUTH_MODE`, `VITE_API` (`mock` | `http`).
6. Update `AGENTS.md` section 5 and `README.md` with the verified commands.

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
- server: `apps/server/src/index.ts`, `apps/server/src/{server,deps}.ts`, the stub files under
  `apps/server/src/{room,http,db,llm,meetings,ask,status,auth}/`;
- web: `apps/web/src/office/OfficeScene.tsx`, `apps/web/src/App.tsx`,
  `apps/web/src/net/store.ts`, `apps/web/src/api/{types,mock,index}.ts`, and the four slot files below.

**Tasks**

1. **Server**:
   - `createServer(deps)` in `src/server.ts` (Express plus Colyseus), used by `index.ts` and by tests.
   - `httpRoutes(app, deps)` from `src/http/routes.ts`, empty for now.
   - The hello room moved to `src/room/office.room.ts`.
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
3. **Tests**:
   - `createServer()` boots in a test and `/health` answers.
   - The mock API applies the four demo changes correctly.

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

1. Colyseus schema classes mirroring `PlayerView`. Test that the field names equal the type's keys.
2. `onAuth` through `AuthVerifier`. `onJoin` validates `JoinOptions`, spawns at `WORLD.spawn` (or the
   nearest free walkable point), and sends `chat_history`.
3. A fixed tick at `TICK_HZ` running `stepPlayer` with each player's latest `move_intent` or
   `move_target`. It sets `lastSeq`, pose and speed, and `zoneId`, sending `zone_event` on change.
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
7. Chat through `ChatStore`. Implement `RoomBus`: find the workspace's room and broadcast `records_changed`.
8. Tests, written first:
   - tampering: an out-of-range `dx`, NaN, extra fields, a flood (rate limited), a target inside a wall;
   - speed stays clamped over 10 s;
   - walls are never crossed;
   - two clients see each other;
   - reconnecting restores state;
   - a seat one player holds cannot be taken by another.

**Acceptance:** G3 "a tampered client cannot teleport or pass through walls" and "reconnect restores
state" are proven by tests. Checks pass.

### P2-B Web networking and remote people [L]

**Depends on:** P1-A, P1-B, P1-C.

**Owns:** `apps/web/src/net/**` (except the store's shape), `apps/web/src/office/Avatar.tsx`,
`apps/web/src/office/me.ts`, `e2e/multiplayer.spec.ts`.

**Tasks**

1. **Connection** (`net/connection.ts`):
   - `@colyseus/sdk` to `VITE_SERVER_URL`; join `office` with `JoinOptions` (name and look from
     `me.ts`; dev auth for now).
   - Reconnect with backoff using the reconnection token.
   - Status goes into the net store.
   - With no server the office stays single-player, exactly as today.
2. **Local avatar**:
   - Held keys send `move_intent` at `TICK_HZ`, plus once on release. A floor click sends `move_target`.
   - A chair or counter click, or E, sends `activity_start`; moving or E sends `activity_stop`.
   - Predict with `stepPlayer` at fixed ticks, render between ticks, and reconcile with
     `lastSeq`: replay unacknowledged inputs; snap if the error exceeds `SNAP_DISTANCE`, ease it out otherwise.
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
- G3 "two browsers see each other move smoothly" passes locally.
- Offline mode is unchanged.
- Frame rate with 2 players and 9 colleagues is reported from a real browser (target 60 fps).

### P2-C Database [L]

**Depends on:** P1-A, P1-B, P1-C. **Owns:** `supabase/**`, `apps/server/src/db/**`.

**Tasks**

1. Migrations for every table in `ARCHITECTURE.md` section 6:
   - `workspace_id` on every workspace row;
   - `source_meeting_id` on records the AI creates or changes;
   - foreign keys, indexes, and enums for the statuses.
2. Row-level security on every workspace table. Members read their workspace. Record writes go
   only through the server (service role), after its own membership checks.
3. Seed from `@office/shared` demo data: workspace, the two users with local test passwords
   (documented, local only, never a real password), memberships and the Acme records. A test
   checks that the seed matches the shared demo data.
4. A `Repo` implementation on postgres.js:
   - `approveChange(id, actor)` in one transaction: lock the row (`FOR UPDATE`); it must be
     pending; apply it per change type; write an `audit_log` row with before and after; mark it approved.
   - `rejectChange`, which also writes an audit row.
   - Reads for my day, status and ask; meetings; chat messages; membership lookup.
5. Tests against local Supabase:
   - workspace isolation (a second workspace created in the test; a user in A cannot read B);
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
2. **One real provider adapter**, chosen by `LLM_PROVIDER` (owner decision D5), with key and model
   from env. It asks for JSON only and has timeouts. It never logs keys, and never logs prompts that
   contain records.
3. **Pipeline**: validate with Zod; on failure retry once with the validation error; then fall back to
   a summary-only result with a "could not extract" notice.
4. **Mapping** `ExtractionResult` to `ProposedChange[]` against a records snapshot, as a pure function.
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
5. Use only `api` (the mock until P3-C) and the net store.

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
   bodies and responses. In `deps.ts`, build the real `Repo` (P2-C), its database chat store,
   `FixtureLlm` with P2-E's `fixtureAnswer` (or the real adapter when a key is set), and the auth
   verifier.
2. **Auth**: verify Supabase JWTs with `jose` (JWKS or secret, as P1-B found), then look up
   membership to get the workspace. The room join verifies the same token when `AUTH_MODE=supabase`.
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

1. A sign-in screen ("Join as Maya" / "Join as Arjun") through Supabase Auth with the seeded local
   test users. Production uses an email and password form.
2. The token goes to every HTTP call and to the room join.
3. On `records_changed`, refetch the affected queries, so panels and wall displays update without a reload.
4. Loading, error and reconnecting states.

**Acceptance:**
- G5 "the second user's view updates live after approval", locally.
- Checks pass.

### P3-D Deployment smoke test [S] (needs owner approval and hosting, decision D3)

**Depends on:** P2-A, P2-B.

**Owns:** deploy configuration (`Dockerfile`, host config such as `fly.toml`, `render.yaml` or
`vercel.json`), `docs/DEPLOY.md`.

**Tasks**

1. Build the server bundle (`tsup` bundles `@office/shared`) and deploy it to the WebSocket host.
2. Build the web app with `VITE_SERVER_URL=wss://...` and deploy it to the web host.
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
2. Performance pass: pixel-ratio cap, shadow cost, instancing. Report numbers from a real browser.
3. Check the notices for fixture mode, reconnecting and errors.
4. `README.md`: setup, deployment and known limitations.
5. The steps for the backup demo video (the owner records it).

### P4-C Rehearsal [S] (owner and agent)

Two devices or networks, a reconnect, and the LLM-unavailable case (key unset). Results go in the report.

**Gate G6** closes Phase 4. Then Phase 5, the final review (`docs/HANDOFF.md` section 8).
