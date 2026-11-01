Work package / gate: P2-A Office room server
Status: passed

Done:
- `apps/server/src/room/office.room.ts`: the stub is now the full room. `static onAuth`
  verifies the SDK's `client.auth.token` through an `AuthVerifier`; `onJoin` validates
  `JoinOptions`, checks `protocol`, refuses a `workspaceId` that is not the token's, spawns
  at `WORLD.spawn` (or the nearest walkable point no other player stands on), and sends
  `chat_history`. First join registers the room; `onDispose` removes it.
- Fixed 20 Hz tick (`setSimulationInterval` + `setPatchRate` at `1000 / TICK_HZ`, fixed
  `TICK_DT` steps) running the shared `stepPlayer` with each player's latest
  `move_intent` (held keys, retained and re-applied each tick until replaced) or
  `move_target` (server-routed with `findPath`). Sets `lastSeq`, pose, speed and `zoneId`,
  broadcasting `zone_event` (leave then enter) on change.
- Activities with one reservation set per room: `activity_start` checks the target is a
  known desk seat or counter spot and is not reserved, walks the player to its approach
  point with the shared sim, then runs the shared `advanceActivity`. A movement message
  (queued, applied once free) or `activity_stop` ends it by standing up first. Leaving
  releases the reservation. P3-A adds colleagues to the same set.
- Validation and limits: every message parsed with the shared Zod schemas (invalid ones
  get `error invalid_message` and are ignored); movement messages capped at 30/s and chat
  at 5 per 10 s per connection (`rate_limited`); unwalkable or unreachable targets get
  `unwalkable`; held targets get `target_taken`. No message can set a position.
- Reconnect with `allowReconnection(RECONNECT_SECONDS)` in `onDrop`; player, position and
  reservation survive the window; `onLeave` removes the player.
- Chat through a per-room `InMemoryChatStore` (one per workspace, so workspaces never
  share history); `chat_history` (last 50) on join.
- `rooms.ts`: the `Map<workspaceId, OfficeRoom>` registry (ARCHITECTURE.md 12.2).
  `bus.ts` gains `RegistryBus`, which broadcasts `records_changed` to the workspace's
  room (quiet no-op when nobody is online); `StubBus` stays for tests.
- Kept the P1-C schema mirror untouched, including the interface + manual-`type()` pattern
  and its field-name test (still passing).
- 15 socket tests in `office.room.test.ts` (`@colyseus/testing` boots the real server;
  every test drives it with the SDK over a real socket): join refusals, two clients seeing
  each other, intent/target movement with `lastSeq`/pose/speed, tampered input (out-of-
  range `dx`, NaN, extra field, flood, wall target), 10 s speed clamp + walkability
  sampling, reconnect restoring player and seat, seat contention, full sit-down/stand-up
  through the tick, `zone_event`, chat + rate limit + history replay, status/look,
  `records_changed` via `RegistryBus`, wired verifier + fail-closed default.

Evidence:
- `pnpm typecheck`: 3/3 pass (fresh).
- `pnpm lint`: 3/3 pass (fresh).
- `pnpm test`: 3/3 pass (shared 107, server 36 in 7 files = 21 prior + 15 new, web 7).
- `pnpm build`: ok (web + server bundle).
- No e2e: P2-A owns no e2e files (`e2e/multiplayer.spec.ts` is P2-B's); existing smoke
  untouched (web unchanged).
- Live probe `C:\tmp\p2a-live-probe.mjs` against dev server on :2573 (killed after, port
  verified free): `/health` ok; joined at spawn 14.75/37.40; intent moved the avatar
  (lastSeq 1, pose walk, speed 2.30); chat round-tripped; `dx: 5` rejected with
  `invalid_message`; clean leave.
- G3 items "a tampered client cannot teleport or pass through walls" and "reconnect
  restores state" proven by the tests above.

Deviations (all inside Owned files; behaviour choices the package text leaves open):
- The player's name comes from the verified token claims, not the `displayName` join
  option (the token is the authenticated source; both carry the same name in dev).
- The synced `activity` appears on arrival at the chair/counter, not while walking over
  (the approach reconciles like a `move_target`; P2-B draws from snapshots once set).
- A second `activity_start` while active replaces the old one (reservation freed, new
  approach begins) rather than erroring; deterministic and documented in the room.
- `AUTH_MODE=supabase` without a wired verifier refuses all joins (fail closed); the
  `DevAuth` default keeps local dev working with no wiring changes.
- A zone change broadcasts `leave` for the old zone (when named) and `enter` for the new
  one (when named).

Files changed outside "Owns": none. Only `apps/server/src/room/**` plus this report.
The live probe lives at `C:\tmp\p2a-live-probe.mjs` (outside the repo, kept for re-runs).

Requests (all P1-C-owned files; the room works without them on the single demo
workspace, but production wiring needs them):
- `apps/server/src/server.ts`: add `.filterBy(["workspaceId"])` to the
  `define("office", OfficeRoom)` line so matchmaking makes one room per workspace.
- `apps/server/src/server.ts` or `index.ts` (after P3-B): assign the Supabase verifier
  (`OfficeRoom.verifier = deps.auth`).
- `apps/server/src/deps.ts`: use `new RegistryBus()` from `room/bus.ts` instead of
  `StubBus` so the HTTP API reaches live rooms. Note the room keeps a per-workspace
  `InMemoryChatStore` for isolation; `deps.chat` remains for future HTTP use.

How to verify:
- `pnpm --filter @office/server exec vitest run src/room/office.room.test.ts` (15 tests,
  ~35 s, all over real sockets).
- `PORT=2573 pnpm --filter @office/server exec tsx src/index.ts`, then
  `node C:\tmp\p2a-live-probe.mjs`; stop the server after.
- `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` from the repo root.

Open questions: none for P2-A. D6 (colleagues on the server) is still open but is P3-A's
decision; the room's reservation set and tick are ready for it either way.

Next: P2-B (web networking: prediction against `lastSeq`, reconciliation at
`SNAP_DISTANCE`, interpolation with `INTERP_DELAY_MS`) and P3-A (shared colleagues on
this tick) are unblocked by this; not started.

## Review (2026-11-01, independent re-verification from scratch)

Verdict: passed. No fixes needed; no files changed by the reviewer except this addendum.

Checks I ran (this session, in this working tree):
- Read every owned file body: `apps/server/src/room/office.room.ts` (607 lines),
  `schema.ts`, `schema.test.ts`, `office.room.test.ts` (15 tests), `bus.ts`, `rooms.ts`,
  `chat.ts`; plus `packages/shared/src/net/index.ts` (contract), `people/activity.ts`
  (signatures), `apps/server/src/auth/verify.ts`, and the `onDrop`/`allowReconnection`
  path in the installed `@colyseus/core` 0.18 `Room.ts`.
- `pnpm typecheck`: 3/3 pass. `pnpm lint`: 3/3 pass.
- `pnpm test`: 3/3 pass — shared 107, server 49 passed + 2 skipped (9 files, incl. all
  15 room tests over real sockets and the 4 schema-mirror tests), web 24.
- No e2e run: P2-A owns no e2e files (`e2e/multiplayer.spec.ts` is P2-B's), per the task.
- Secrets grep over `apps/server/src/room/*.ts` (`service_role|sk-|eyJ|password|secret|
  api[_-]?key`): clean (one comment noting a log line carries no secrets).
- Shared-contract rules: every handler parses with the shared Zod schemas (`.strict`,
  invalid input gets `invalid_message` and is ignored); no wire payload type is declared
  outside `packages/shared` (`HeldInput`/`SessionRecord` are internal session bookkeeping);
  no message sets a position (`move_target` x/z is routed via `findPath`, never assigned);
  the room only reads (never edits) other packages' files (`../auth/verify.js`, shared).

Acceptance, item by item (WORK_PACKAGES.md P2-A tasks 1-8):
1. Schema mirror kept + field-name test passing (4/4).
2. `static onAuth` verifies `client.auth.token` via `AuthVerifier`; `onJoin` validates
   `JoinOptions`, checks `PROTOCOL_VERSION`, refuses workspace mismatch, spawns at
   `WORLD.spawn`/nearest free walkable point, sends `chat_history`; registry
   set on first join / removed on dispose. Join-refusal tests pass.
3. Fixed 20 Hz tick (`setSimulationInterval` + `setPatchRate` at `1000/TICK_HZ`) running
   shared `stepPlayer`; `lastSeq`/pose/speed/`zoneId` set; `zone_event` (leave then enter)
   on change. Proven by the intent/target/zone tests.
4. Activities: known desk-seat/counter-spot check, one reservation set per room, shared
   `advanceActivity` on the tick, movement/`activity_stop` ends via stand-up first,
   leave releases. Proven by seat-contention, sit/stand-through-tick, and reconnect tests.
5. Validation + limits: all 7 messages parsed; movement 30/s and chat 5/10s buckets with
   `rate_limited`; unwalkable/unreachable targets rejected; seat held by another gives
   `target_taken`. Proven by the tampering (out-of-range dx, NaN, extra field), flood,
   and wall-target tests.
6. Reconnect: `onDrop` + `allowReconnection(RECONNECT_SECONDS)` is the documented 0.18
   pattern (verified in `Room.ts`: `onLeave` is deferred until the window expires, so the
   player and reservation survive). Test rejoins with the same sessionId, position and seat.
7. Chat via per-room `InMemoryChatStore` (`chat_history`, last 50, on join);
   `RegistryBus.recordsChanged` broadcasts to the workspace room, quiet no-op when offline.
   Tests pass.
8. 15 socket tests via `@colyseus/testing` cover every named case: tampering, 10 s speed
   clamp + wall-walkability sampling, two clients seeing each other, reconnect, seat
   contention. G3 items "tampered client cannot teleport or pass through walls" and
   "reconnect restores state" are proven.

Deviations (all acceptable, none violate the package text or ARCHITECTURE.md 12.1/12.2):
name from token claims (matches 12.3), activity synced on arrival, second
`activity_start` replaces deterministically, fail-closed `AUTH_MODE=supabase` default,
leave+enter zone broadcasts. Each is documented in the room or report.

Still open (correctly left as requests in others' files, verified not yet done):
`server.ts` line 30 still lacks `.filterBy(["workspaceId"])`; `deps.ts` still uses
`StubBus`. Both are P1-C/P3-B-owned; single-workspace behaviour is unaffected.

Scope note: this tree holds several packages' uncommitted work at once (P1 + P2-A/B/C
reports present), so per-package attribution via git is not possible; judged on the
owned `apps/server/src/room/**` contents, which touch nothing outside their Owns list.
