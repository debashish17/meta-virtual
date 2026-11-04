# P6-D Free seating and the company board

Work package / gate: P6-D Free seating and the company board
Status: passed (with two lead-owned wiring items below; both diffs provided and verified as far as my files reach)

## Done

Free seating (shared):

- `packages/shared/src/people/seats.ts` (new): `FREE_SEATS` — 141 `sit_talk` seats
  with `seat:x,z` ids, open to anyone: lounge armchairs (fabric, leather),
  accent chairs, sofas per cushion (2-seater x2, 3-seater x3, high-back x2),
  cafe visitor chairs, meeting-room chairs (conference, executive, visitor) and
  the non-team task chairs (meeting rooms, huddles, focus rooms). A seat is
  listed only when its approach is walkable, in-zone (never through a wall) and
  reachable from the spawn; 7 unapproachable seats are filtered (2 huddle
  chairs facing the south wall, 2 tight town-hall rows, 2 window-corner sofa
  cushions, 1 huddle end chair whose approach is outside the room).
- The seat lookup in `people/activity.ts`: `targetNear` searches `ALL_SEATS`
  (desk + free), so the E chip, halo, chair clicks and offline sitting offer
  free seats with no web changes; the seated pose is the seat's own
  (`sit_talk` on free seats, still `type` on desks, as `routine.ts` colleagues
  already do). `seatKey` moved to `seats.ts` (cycle-free) and is re-exported
  from `activity.ts` and the people root, so every existing importer works.
- Screenshot review of all 13 part types seated: 11 kept, 2 dropped (below).

Company board (server + web + migration):

- `apps/server/src/board/store.ts`: real in-memory store (workspace-scoped
  list oldest-first, create stamped with author, author-only remove: other's
  pin is `BoardForbiddenError` -> 403, unknown pin -> 404).
- `apps/server/src/board/postgres.ts` (new): Postgres store mirroring the
  P6-B/P6-C pattern (`withUser` reads, `withService` writes after membership
  check).
- `apps/server/src/board/routes.ts`: `GET /board`, `POST /board` (201),
  `DELETE /board/:id`, all validated with the shared schemas; every write
  broadcasts `records_changed board`.
- `supabase/migrations/20261103000300_board.sql` (new): `board_pins` with
  workspace FK, member-select RLS (`is_workspace_member`), no write policies,
  browser write grants revoked. Applied forward-only to local Supabase and
  recorded in `schema_migrations` (no reset).
- `apps/web/src/api/board.ts`: the P6-0 scaffold turned out to be already
  complete (mock + http, same shape as notes); verified, no changes needed.
- `apps/web/src/board/store.ts` (new): `useBoard` (loads + refetches on
  `records_changed board`) and `useBoardUi` (overlay open state).
- `apps/web/src/board/BoardOverlay.tsx`: centred sticky-note overlay (notes
  palette), add form with colours, Remove on own pins, closes on backdrop /
  button / Escape.
- `apps/web/src/board/BoardTexture.tsx` + `draw.ts` (new): the newest 6 pins
  drawn on both cork boards (ideas wall + project room, placed from the shared
  layout, never moved); clicking either board opens the overlay.

## Evidence

- `pnpm typecheck`, `pnpm lint`, `pnpm test`: all green. Server 274 passed
  (+7 pre-existing skips), web 237 (+4), shared 150. My suites: `seats.test.ts`
  (8), board `store/routes/postgres.test.ts` (16 run, incl. 7 Postgres tests
  against local Supabase), `draw.test.ts` + `BoardOverlay.test.tsx` (8).
- `pnpm test:e2e`: full run 10 passed / 2 failed; both failures are other lanes' and reproduce without my changes: receipts.spec passes alone (contention flake in the 18.5 min parallel run), live-meeting.spec captions fails identically on the clean base (verified via stash + rerun + pop: pre-existing). e2e/demo.spec.ts passes alone (2.2 min), untouched.
- Seating screenshots (offline, each type seated, `C:/tmp/p6d-seat-*.png`):
  lounge-chair-fabric/leather, accent-chair-light, sofa-2-seater,
  3-seater-sofa, high-back-sofa, visitor-chair (cafe), conference-chair
  (meeting A), executive-chair (boardroom), task-chair-black (project room),
  task-chair-grey (huddle) all sit correctly with the "Stand up" chip; both
  bar stools sink the sitter through the stool (crops
  `p6d-seat-bar-stool-*-crop.png`) and are left out.
- Board screenshots (`C:/tmp/`): `p6d-board-overlay.png` (3 pins, colours,
  Remove), `p6d-board-cork-texture.png` (+crop: pins on the ideas-wall cork),
  `p6d-board-click-opens.png` (overlay opened by a real Playwright mouse click
  on the cork: CLICK-OPENS-OK), `p6d-board-live.png` (two browsers online, a
  pin by Maya arrives in Arjun's open overlay with no refresh: LIVE-BOARD-OK).
- Room probe against a live server: `activity_start` on free seat
  `seat:3.40,37.35` answers `invalid_message / unknown activity target`
  today, which the requested one-line change below turns into a sit.

## Deviations

- Bar stools (`seating.bar-stool-with-back`, `seating.bar-stool-backless`)
  are NOT free seats: the sit-down is authored for chair height, so a sitter
  sinks ~0.3 m through a 0.76 m stool. Left out rather than hacked, per the
  package rule; the code and a test say so.
- `apps/web/src/api/board.ts` needed no changes (P6-0 scaffold complete).
- `BoardTexture` uses R3F `onClick` (verified with a real click). Note for
  future click checks: the camera eases for ~8 s after a teleport, so an aim
  sample must be re-polled until stable or the click misses the mesh.

## Files changed outside "Owns"

- `packages/shared/src/people/index.ts`: one export line for `seats.ts` plus
  the explicit `seatKey` line (the `RecordKind` precedent; without it the root
  loses `seatKey` to a star-export conflict and `net.test.ts` fails). Same
  one-liner P6-B added for `rooms.ts`.
- Nothing else. `e2e/demo.spec.ts`, `AuthGate.tsx`, `me.ts`, `deps.ts` and
  every other lane's files untouched. No commits (as instructed).

## Requests (lead-owned wiring; diffs ready to paste)

1. Room accepts free seats — `apps/server/src/room/office.room.ts`,
   `targetById` (currently `DESK_SEATS.find` only):
   `const seat = ALL_SEATS.find((s) => s.id === targetId);`
   (import `ALL_SEATS` from `@office/shared`; `DESK_SEATS` stays for its
   other uses). Verified live that this is the only gate: the probe above
   fails exactly there. Suggested room test (mirrors the file's style; needs
   `FREE_SEATS` + `isHomeDeskSeat` imports, both already partly imported):

   ```ts
   it("lets anyone sit on a free seat, with no owner check", { timeout: 90000 }, async () => {
     const { testServer } = await setup();
     const maya = await join(testServer, "Maya");
     const arjun = await join(testServer, "Arjun");
     const seat = FREE_SEATS.map((s) => ({ id: s.id, d: OFFICE_WALK.findPath(SPAWN, s.aisle).length }))
       .filter((s) => s.d > 0).sort((a, b) => a.d - b.d)[0];
     expect(isHomeDeskSeat(seat.id)).toBe(false);
     maya.send(CLIENT_MESSAGE.activityStart, { seq: 1, targetId: seat.id });
     await waitFor(
       () => serverPlayer(maya.sessionId)?.activity.targetId === seat.id,
       45000, "Maya's arrival at the lounge seat");
     await waitFor(() => serverPlayer(maya.sessionId)?.pose === "sit_talk", 30000, "chatting");
     const waiting = arjun.waitForMessage(SERVER_MESSAGE.error, 5000);
     arjun.send(CLIENT_MESSAGE.activityStart, { seq: 1, targetId: seat.id });
     expect((await waiting).code).toBe("target_taken");
     maya.send(CLIENT_MESSAGE.activityStop, { seq: 2 });
     await waitFor(
       () => serverPlayer(maya.sessionId)?.activity.kind === "", 30000, "Maya standing up");
     arjun.send(CLIENT_MESSAGE.activityStart, { seq: 2, targetId: seat.id });
     await waitFor(
       () => serverPlayer(arjun.sessionId)?.activity.targetId === seat.id,
       45000, "Arjun's arrival at the same seat");
   });
   ```

2. Postgres board store — `apps/server/src/deps.ts` (`board:` line):
   `board: repo instanceof PostgresRepo ? createPostgresBoardStore(repo) : createInMemoryBoardStore(),`
   plus `import { createPostgresBoardStore } from "./board/postgres.js";`.
   The Postgres store + migration are tested against local Supabase; the
   hosted project needs the migration applied via the MCP when the lead
   chooses (`20261103000300_board.sql`).

3. Finding, not a request: the wall-display TV `onClick` also fails to open
   its overlay in a headless real-click check (same rig that proves the
   board opens). Possibly pre-existing/headless-only; P6-R's files, so only
   reported.

## How to verify

- `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:e2e` from the root.
- Board, two browsers: `PORT=2569 pnpm --filter @office/server dev` and
  `WEB_PORT=5175 VITE_SERVER_URL=http://localhost:2569 VITE_API=http pnpm
  --filter @office/web dev`; open `?name=Maya` and `?name=Arjun`; click the
  cork board (ideas wall) in both; pin in one, watch the other.
- Free seats offline: any seat screenshot flow, e.g.
  `__officeDebug.teleport(3.40, 38.20)` then E sits the lounge chair.
- After request 1 merges: the room test above, plus sitting a lounge chair
  online in two browsers.

## Open questions

- None for the demo. If the owner wants stools sittable later, it needs a
  taller sit variant (new move or a seat-height offset), not a lookup tweak.

## Next

- Lead applies requests 1-2, runs the suggested room test, merges; P6-E can
  then demo the board (pin the Acme go-live) and lounge sitting in its story.
- Seat types kept: lounge-chair-fabric, lounge-chair-leather,
  accent-chair-light, sofa-2-seater, 3-seater-sofa, high-back-sofa,
  visitor-chair, conference-chair, executive-chair, task-chair-black,
  task-chair-grey. Dropped: bar-stool-with-back, bar-stool-backless (sink
  through; see Deviations).
