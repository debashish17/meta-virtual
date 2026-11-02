# P3-A Shared colleagues — checkpoint report

Work package / gate: P3-A Shared colleagues (decision D6: keep colleagues, run on the server, same for everyone)
Status: partial

Done:
- `apps/server/src/room/npcs.ts` (new): `NpcDirector`, one per room. It runs the shared
  colleague routines (`advance`, `routineAtDesk`, `routineAway` from `@office/shared`) and
  mirrors each colleague into the synced `npcs` map as `NpcView` (id = preset id, name, look,
  x, z, facing, pose, speed). The room lends its own reservation set (`taken`): desks are
  reserved at spawn from `DESK_SEATS` (same `seat:x,z` ids players use), outing spots while
  on the way or there, everything freed on remove — including both spots of a tea outing
  (counter + chat), which `routine.spot` alone does not name.
- `sync(state, taken, playerNames)` reconciles colleagues with the signed-in names
  (case-insensitive): presets matching a player (Maya, Arjun) are removed with their
  reservations freed, all others spawn on free desks; idempotent; respawns on leave.
  `tick(state, taken, dt)` advances routines and mirrors state. Desks follow the same
  team spread and away-starts (`STARTS_AWAY`) as the offline colleagues.
- `apps/server/src/room/npcs.test.ts` (new, 9 tests): full spawn, exclusion by name,
  idempotence, join-removal frees the desk, leave-respawn on a free desk, never takes a
  player-held seat (all-held and one-held cases), 100 s tick keeps every mirror valid as
  `NpcView` with exclusive spots, and mid-outing removal frees desk + both outing spots.
- `apps/web/src/office/Colleagues.tsx`: subscribes to the net store; online or
  reconnecting (with a seat) it renders nothing so `Players.tsx` npc slots draw the synced
  colleagues and local routines stop; offline it runs exactly as before (same memo, same
  `TAKEN` reservations, resumed on return). Added a DEV-only `window.__officeNpcs` hook
  (name/pose/position per synced npc) mirroring `__officeNet`, used for verification.
- No change to `apps/server/src/room/schema.ts` was needed: `NpcState`/`npcs` already
  mirror `NpcView` field for field (`schema.test.ts` passes unchanged).

Evidence:
- `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` pass on the final tree from the
  worktree root. Tests: shared 107, web 58, server 100 passed + 12 pre-existing skips
  (DB tests needing local Supabase), including the 9 new `npcs.test.ts`.
- Seat exclusion (acceptance item 2) is proven by the tests above at the shared-set level;
  the room's `target_taken` refusal for held seats is P2-A-tested against the same set.
- Socket soak (throwaway vitest, deleted after): 2 SDK clients + StrictMode orphans,
  second join mid-outing, 120 s, movement throughout — 0 drops, 8 npcs, reservations held.
- Live two-browser acceptance on lane ports (web 5174, server 2568) with the requested
  room wiring applied temporarily (see Requests; reverted before commit): Maya + Arjun,
  both online, both see NPCs Lena + Omar (Maya/Arjun excluded); poses evolve identically
  in both browsers (talk/type, walk/type, type/type); when seated both agree to 0.000 m;
  pills per browser remote-name=3 (other player + 2 npcs), all=4 (+ own avatar), i.e. no
  local-colleague doubling. Screenshots: `/tmp/p3a-maya.png`, `/tmp/p3a-arjun.png`.
  Two accommodations were needed on this box (details under Requests): the run used 2
  NPCs at a 5 Hz patch rate (temp edits, reverted; mechanics identical — unit + socket
  tests cover 8–10 NPCs at full rate), and relaxed WS ping (temp, reverted).
- Offline check (server down): status offline, 0 remote pills, 10 total (avatar + 9 local
  colleagues) — single-player mode unchanged. Screenshot: `/tmp/p3a-offline.png`.

Deviations:
- Live acceptance ran with 2 NPCs at 5 Hz patches instead of 8 at 20 Hz: with 8 NPCs at
  20 Hz both headless-shell renderers on this 4-vCPU box saturate (every patch re-renders
  all remote persons via `Players.tsx`) and CDP goes unresponsive, so positions cannot be
  compared. Same code paths; count/rate restored before commit.
- Live acceptance ran with relaxed WS ping (15 s x 10, temp): the default 3 s x 2
  terminates browser clients during box-level stalls (proven by `colyseus:connection`
  "terminating unresponsive client" logs at drops). Production browsers pong in ms; this
  is a loaded-box margin issue, not product behavior.

Files changed outside "Owns": none in the committed state. `office.room.ts` (wiring) and
`server.ts` (ping) were edited temporarily for verification and reverted; the wiring diff
is preserved inline under Requests and at `/tmp/p3a-wiring.diff`.

Requests:
1. Room wiring (P2-A file; blocks online colleagues — without it the branch is inert
   online). Exact change for `apps/server/src/room/office.room.ts`:
   - `import { NpcDirector } from "./npcs.js";`, field `private readonly npcs = new NpcDirector();`
   - end of `onCreate`: `this.npcs.sync(this.state, this.taken, []);`
   - end of `onJoin` and of `onLeave` (after `removePlayer`): `this.syncNpcs();`
   - end of `tick`: `this.npcs.tick(this.state, this.taken, TICK_DT);`
   - helper: `private syncNpcs(): void { const names = [...this.state.players.values()].map((p) => p.name); this.npcs.sync(this.state, this.taken, names); }`
   Verified live as described above (with the temp accommodations).
2. Ping margin for dev/e2e on loaded boxes (`apps/server/src/server.ts`, P1-C file):
   consider env-gated relaxed `pingInterval`/`pingMaxRetries` for dev and the e2e stack
   (strict stays for production). Evidence: terminations logged at drops; 30+ min stable
   with relaxed ping vs churn with strict under identical load.
3. Decouple remote-person rendering from patch rate (`apps/web/src/net/connection.ts`,
   `Players.tsx`, P2-B files): at 8+ remotes x 20 Hz every patch re-renders every remote
   person, which saturates software rendering; writing snapshots into refs read by
   `useFrame` (as local colleagues/avatars do) would remove the cliff.
4. Optional: move the desk-spread order (`spreadDesks` here, `seats()` in `Colleagues.tsx`)
   into `packages/shared` to remove the small duplication (shared is post-Gate-P1 locked).

How to verify:
- `git checkout wp/P3-A-shared-colleagues && pnpm install && pnpm typecheck && pnpm lint && pnpm test && pnpm build`
- `npx vitest run src/room/npcs.test.ts` in `apps/server` (9 tests).
- Live (after the lead applies request 1): lane ports `WEB_PORT=5174 PORT=2568`,
  two browsers as `?name=Maya` / `?name=Arjun`; compare `__officeNpcs()` and pills.
  Probes used: `/tmp/p3a-two-browsers.mjs`, `/tmp/p3a-final.mjs` (kept out of the repo).

Open questions: none for P3-A. D6 is settled; the acceptance gap is only the wiring request.

Next: P3-E demo e2e can rely on shared colleagues once request 1 is merged; requests 2–3
unblock stable multi-browser verification on this box for all lanes.

## Reviewer addendum (2026-11-02, independent re-verification)

Checks re-run fresh from the worktree root on the committed tree (`2ff4137`):
- `pnpm typecheck`: pass (3/3). `pnpm lint`: pass (3/3).
- `npx turbo run test --force`: shared 107 passed, web 58 passed, server 100 passed +
  12 pre-existing skips (DB tests needing local Supabase). `npx vitest run
  src/room/npcs.test.ts`: 9/9 pass.
- `npx turbo run build --force`: pass (2/2, uncached). No package e2e exists for P3-A.
- `git diff main...HEAD --name-status`: only `apps/server/src/room/npcs.ts` (new),
  `apps/server/src/room/npcs.test.ts` (new), `apps/web/src/office/Colleagues.tsx`
  (modified), `docs/reports/P3-A.md` (new) — all inside Owns. No existing test file
  modified. Secrets grep over the diff: no match.

Code read in full (not search output): `npcs.ts` (216 lines), `npcs.test.ts` (174 lines),
`Colleagues.tsx` (diff + full file). Cross-checked read-only: `office.room.ts` has the
shared `taken` set and `target_taken` refusal but no `NpcDirector` wiring (confirmed
absent); `DESK_SEATS` ids are `seatKey` (`seat:x,z`), the same id space the room uses for
player seats, so the shared-set exclusion is sound; `connection.ts` subscribes
`state.npcs` into the net store and `net/Players.tsx` draws them; online clicks use
`NO_RESERVATIONS` (server decides), so the hidden local colleagues keeping `TAKEN`
entries while online is harmless and offline resume is exact.

Independent socket probe (throwaway `p3a-review.test.ts`, deleted after; `/tmp/p3a-wiring.diff`
applied temporarily, then reverted — tree verified clean afterwards):
- The wiring diff applies cleanly with `git apply --check`.
- Two SDK clients (Maya + Arjun) over a real room: both see `LOOK_PRESETS.length - 2`
  npcs, identical ids and byte-identical snapshots (id/name/x/z/facing/pose), with
  Maya/Arjun excluded. Pass.
- After Arjun leaves, Maya's client sees the Arjun preset respawn. Pass.

Verdict per acceptance item:
- "Two browsers see the same colleagues in the same places": PROVEN modulo the wiring —
  the sync path is verified over real sockets, but the committed tree is inert online
  because `office.room.ts` (P2-A owned) has no wiring. Holds on merge of Request 1.
- "A player and a colleague never hold the same seat (test)": PASS — `npcs.test.ts`
  (all-held, one-held, join-removal frees desk, mid-outing removal frees desk + both
  outing spots, 100 s tick keeps exclusive spots) plus the shared id space.
- Task 3 (name exclusion incl. join/leave/respawn): PASS, unit + socket proven.

Fixes applied: none — no defect found; nothing in Owns needed changing.

Status: partial (unchanged). Only Request 1 (room wiring, exact diff already supplied and
now reviewer-verified over sockets) blocks online colleagues. Requests 2–4 are endorsed
as written; no new requests.
