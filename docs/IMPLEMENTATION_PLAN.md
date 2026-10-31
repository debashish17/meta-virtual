# IMPLEMENTATION_PLAN.md

Ordered milestones for the agent. Each milestone ends at a **gate**. At a gate, stop, send the checkpoint report from `AGENTS.md`, and wait for the owner to say "continue" before starting the next milestone.

Time budget: 1 to 2 weeks. The rough share of effort is in brackets. If time runs short, cut from the bottom (M7, then parts of M6), never from the visual gate or the memory loop.

Tasks inside a milestone run autonomously. Tests are written alongside the code they cover.

---

## M0 — Bootstrap and toolchain [5%]

**Tasks**
1. Inspect the repo: Git state, Node and pnpm versions, existing files. Report anything unexpected.
2. Create the pnpm workspace: `apps/web` (Vite React TS), `apps/server`, `packages/shared`, root `turbo.json`, `tsconfig.base.json`, ESLint and Prettier, Vitest.
3. Name the shared package `@office/shared`. Both apps depend on it with `workspace:*`.
4. Configure the server build with `tsup` and bundle the shared package (see `ARCHITECTURE.md` section 2).
5. Add a hello-world Colyseus room on the server and a constant exported from `shared` that both apps print.
6. Verify the real commands and update `AGENTS.md` section 5 and `README.md`.
7. Check which services are configured (names only, never values): Supabase, AI provider, hosting.

**Gate G0**
- [ ] `pnpm dev` starts web and server.
- [ ] Web renders the shared constant; server logs it.
- [ ] `pnpm build` succeeds and `node apps/server/dist/index.js` starts the server.
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test` run (even if only one trivial test).
- [ ] Service readiness listed in the report.

---

## M1 — Static reference-matched office [25%]

**Tasks**
1. Build the fixed orthographic camera, floor, north and east walls, window wall, lighting (see `DESIGN_SPEC.md`).
2. Define the world in `packages/shared`: dimensions, zones, obstacles, furniture placements.
3. Build reusable furniture components and render all placements from data.
4. Build glass rooms with dark frames and door gaps, whiteboard, wall displays, kitchenette, dining and lounge, desk clusters, shelving, printer, plants.
5. Add the cutaway behaviour for south and west walls.
6. Add a screenshot script that renders the scene at 1440 by 810 and saves it to `docs/screenshots/`.
7. Compare with the reference using the checklist in `DESIGN_SPEC.md` section 10; iterate until it passes.

**Gate G1 (human review required)**
- [ ] Every item in the visual acceptance checklist is checked.
- [ ] Screenshot saved and shown to the owner.
- [ ] Frame rate acceptable on a laptop (report the number).
- [ ] The owner approves the look. **No movement or multiplayer work before this.**

---

## M2 — Avatar, movement and collision [10%]

**Tasks**
1. Implement `isWalkable`, `zoneAt` and the walkability grid in `shared`, with unit tests (walls, glass, furniture, door gaps).
2. Implement a local avatar with keyboard movement, facing, walk bob and a name label.
3. Implement `findPath` (grid A*) and click-to-move, with unit tests.
4. Show zone entry (room label pill) on the client.

**Gate G2**
- [ ] The avatar cannot walk through walls, glass or furniture; it can use door gaps.
- [ ] Unit tests cover collision, pathfinding and zones.
- [ ] Movement feels smooth at 60 fps on a laptop.

---

## M3 — Multiplayer and early deployment smoke test [15%]

**Tasks**
1. Implement the `office` room with the Player schema and message contracts (`ARCHITECTURE.md` section 4), validated with Zod.
2. Server-authoritative movement at a fixed tick, speed clamping, rejection of unwalkable moves, rate limiting.
3. Client prediction for the local avatar and interpolation for remote avatars.
4. Join, leave and reconnect handling; presence list; text chat with persistence stubbed if the database is not ready.
5. Playwright test: two browser contexts join, see each other, and one moves.
6. **Deployment smoke test:** deploy a minimal build of web and server to the chosen hosts (owner approval required), confirm the WebSocket connects over TLS. Do this now, not at the end.

**Gate G3**
- [ ] Two browsers see each other move smoothly.
- [ ] A tampered client cannot teleport or pass through walls (test proves it).
- [ ] Reconnect restores state.
- [ ] A public URL connects to the deployed server (or the blocker is reported).

---

## M4 — Memory backend [20%]

**Tasks**
1. Supabase project setup via migrations in `supabase/migrations`: all tables in `ARCHITECTURE.md` section 6, RLS policies, and `supabase/seed.sql` with the Northwind and Acme demo data from `PROJECT_BRIEF.md`.
2. Auth: demo sign-in for the two seeded users; server verifies JWTs and workspace membership.
3. Zod schemas in `shared` for `ExtractionResult`, `ProposedChange`, `AskResult` and all HTTP bodies.
4. `LlmClient` interface, `FixtureLlm` (deterministic, handles the demo transcript and demo questions), and one real provider adapter behind env configuration.
5. `POST /meetings`: extraction, validation with one retry, fallback, mapping to proposed changes.
6. `POST /proposed-changes/:id/approve` and `/reject`: transactional apply, audit log, `records_changed` broadcast to the room.
7. `GET /me/day`, `GET /projects/:id/status`, `GET /accounts/:id/status`.
8. `POST /ask`: classification, structured queries, source validation, abstention.
9. Tests: extraction mapping, approval transaction, double-approval rejection, RLS isolation between workspaces, ask abstention and source validation.

**Gate G4**
- [ ] Running the fixture transcript produces the expected proposed changes.
- [ ] Approving changes updates the records and writes audit rows.
- [ ] `/ask` returns a cited answer for the demo status question and abstains for the unsupported one.
- [ ] With no LLM key, everything above still works through `FixtureLlm`.
- [ ] RLS test proves workspace isolation.
- [ ] No secrets in the repo.

---

## M5 — Product UI and live propagation [15%]

**Tasks**
1. Zustand stores for players, chat, records and UI state.
2. Panels per `DESIGN_SPEC.md` section 9: participants, chat, My day, ask-the-office, approval drawer, room label.
3. In-scene wall displays for the Customer room and Project room showing live status; click opens a larger overlay.
4. "Process meeting" action in the Customer room that submits the fixture transcript; shows the extracted summary and decisions.
5. Approval drawer with before and after diffs, approve and reject, and a "needs review" state.
6. On `records_changed`, refetch the relevant queries and update panels and wall displays without a page refresh.
7. Ask-the-office UI shows the answer, abstention state and clickable sources.
8. Visible notices for fixture mode, reconnecting and errors.
9. Playwright test: run the full demo script across two browser contexts.

**Gate G5**
- [ ] The full demo script from `PROJECT_BRIEF.md` passes locally in two browsers.
- [ ] The second user views update live after approval.
- [ ] Rejected changes do not alter records.
- [ ] The UI does not cover the centre of the scene.

---

## M6 — Deploy, harden and rehearse [8%]

**Tasks**
1. Deploy web and server with production env vars (owner approval required). Configure CORS, WebSocket URL and Supabase redirect URLs.
2. Run the Playwright demo script against the deployed URL.
3. Test on two devices or networks, including a reconnect and an LLM-unavailable case.
4. Performance pass: instancing, pixel ratio cap, shadow cost.
5. Seed reset script so the demo can be restored in one command.
6. Update `README.md` with setup, deployment and known limitations.
7. Record a backup demo video script (steps listed; the owner records).

**Gate G6**
- [ ] Public demo completes end to end on the deployed app.
- [ ] Reset script restores the starting state.
- [ ] Known limitations documented.

---

## M7 — Stretch (only after G6, one at a time) [2%+]

In priority order. Each needs owner approval to start.

1. Live captions or a pasted-transcript upload instead of the fixture only.
2. Voice with LiveKit in meeting rooms (server-issued tokens, mute, mic-denied handling).
3. Semantic search with pgvector for decision-history questions.
4. Engineering room: GitHub status on the project wall, screen share.
5. Shared snippet pad (Yjs plus CodeMirror, no execution).
6. Supabase Realtime in place of Colyseus invalidation broadcasts.
7. Better avatars and lighting polish.

---

## Stop conditions (apply to every milestone)

Stop and report if:
- A gate item cannot be met after a reasonable attempt.
- A locked decision must change.
- A required service is missing or credentials fail.
- Scope would need to grow to finish the task.
- A test fails and the only way to pass it is to change the test.
