# P2-B report: Web networking and remote people

```
Work package / gate: P2-B Web networking and remote people (Phase 2)
Status: passed
```

All three acceptance items are verified, including the frame-rate number from a real
headed browser with a hardware GPU (reviewer-measured; see Evidence and the addendum).

## Done

- Connection (`apps/web/src/net/connection.ts`, new): `@colyseus/sdk` to
  `VITE_SERVER_URL`, token as `client.auth.token` (`dev:<name>` from `me.ts`, never in the
  join options), join `office` with validated `JoinOptions` (`PROTOCOL_VERSION`,
  `WORKSPACE_ID`, name, look). State via `getStateCallbacks(room)`; status (`connecting`,
  `online`, `reconnecting`, `offline`) into the untouched P1-C net store; `send.chat/status`
  wired through it. No server after backoff: stays `offline` (single-player). All inbound
  messages parsed with shared Zod schemas; `records_changed` calls `useRecords.refetch`.
- Reconnect per ARCHITECTURE.md 12.2: the SDK's silent internal retry is disabled
  (`room.reconnection.enabled = false`), drops surface via `onDrop` (`reconnecting`), and
  one loop calls `client.reconnect(token)` with backoff inside `RECONNECT_SECONDS`, then
  falls back to a fresh join. Drop drill: same seat and position restored; kill+restart
  drill: fresh seat, back online.
- Local avatar (`apps/web/src/office/Avatar.tsx`, owned): online branch only; the offline
  frame is untouched. Held keys send `move_intent` at `TICK_HZ` plus once on release
  (`screenToIntent` mapping), clicks send `move_target`, chair/counter clicks and E send
  `activity_start`, held keys and E out of an activity send `activity_stop` (clicks send
  their own message, which the server queues through stand-up). Prediction with shared
  `stepPlayer` at fixed ticks, ring buffer per seq, reconcile-without-replay
  (`net/predict.ts`); server snapshots drive the avatar during activities.
- Remote players (`apps/web/src/net/Players.tsx`, was the stub): one `Person` per remote
  player (and per npc, for P3-A) from a snapshot buffer `INTERP_DELAY_MS` behind,
  interpolated position/facing, poses stepping with snapshots, jumps over `SNAP_DISTANCE`
  snapping, colleague-style name pills (`data-testid="remote-name"`). Pure buffer plus
  state mappers in `net/interp.ts` with the `""`-means-null sentinel mapping.
- Look changes send `look_set` from the online tick (same path as movement; also covers
  looks picked while offline). Verified end to end through the Customise-look UI.
- Dev hook `window.__officeNet`: `status()`, `selfId()`, `players()` (id, name, x, z,
  pose, lastSeq, look), `lastError()`, `serverUrl()`, `drop()` (unconsented socket close
  for the reconnect drill).
- e2e `e2e/multiplayer.spec.ts` (new): two contexts join, see each other's name pill, one
  walks with the keyboard, the other observes >0.8 m of server-side movement.
- Unit tests: `net/predict.test.ts` (8: lagging-fake-server agreement with zero
  correction, 100 ms smoothing, snap on rejected move, init/unknown-seq, ring eviction,
  reset, follow-snapshot ease/snap/shortest-arc) and `net/interp.test.ts` (9: sentinel
  mapping, midpoint, snap, facing arc, hold/empty/order).

## Evidence

- `pnpm typecheck`: 3/3 pass. `pnpm lint`: 3/3 pass.
- `pnpm test`: shared 107, server 36, web 24 (17 new) — all pass.
- `pnpm build`: web + server build ok.
- `pnpm test:e2e`: 2/2 pass in 5.9 m — multiplayer 3.0 m, smoke 2.8 m.
- Live probes on lane ports (5175/2569), kept under /tmp: two-client join/walk/pill
  (`/tmp/p2b-live.mjs` PASS), click-to-move + sit/stand + UI look change
  (`/tmp/p2b-online2.mjs` PASS), drop→same-seat (`/tmp/p2b-drop.mjs` PASS),
  kill→restart→fresh-seat (`/tmp/p2b-re2.mjs` PASS), offline status + walk
  (`/tmp/p2b-off.mjs` PASS).
- Screenshots (1440x810): `/tmp/p2b-online.png` (Scout + remote Fern with pill),
  `/tmp/p2b-seated.png` (Scout seated typing, server-driven),
  `/tmp/p2b-offline-overview.png` (matches `docs/screenshots/office-m2-overview.png`
  apart from live traffic; offline mode unchanged).
- Frame rate (reviewer-measured, headed Chromium, NVIDIA GeForce RTX 4050 Laptop GPU):
  111 fps mean over 10 s (1110 frames, p50 7.0 ms, p95 14.0 ms) while Alice walks,
  with Bob connected and 10 colleagues + 10 street pedestrians rendered in the same
  window — above the 60 fps target for 2 players + 9 colleagues. Census: net players
  Alice,Bob; 11 colleague-class pills (10 colleagues + Bob; Alice is not a look preset
  so no preset is filtered); `__officePeople` 22 (avatar + 10 colleagues + Bob + 10
  pedestrians in `Pedestrians.tsx`). Screenshot: `/tmp/p2b-review-online.png`
  (1440x810, Alice + remote Bob at spawn). Scripts kept under `/tmp`: `p2b-fps.mjs`,
  `p2b-census.mjs`, `p2b-census2.mjs` (stack on WEB_PORT=5181, PORT=2581).

## Deviations

- `look_set` goes out from the online tick rather than a store subscription. Same wire
  behaviour, plus looks picked while offline/reconnecting flush on the next live tick.
- The state subscription also listens to the nested `look`/`activity` children: a patch
  touching only a nested child does not trigger the parent's `onChange` (found live —
  a look change applied server-side stayed invisible until the next position patch; a
  later move revealed it). Without this, remote looks would freeze. `P3-A` note: npc
  looks are already covered the same way in `Players.tsx`.
- Movement out of an activity: held keys send one `activity_stop` then flow intents once
  free (per the task text); a floor click sends `move_target` directly, which the server
  queues through stand-up while the client predicts it on return to free.
- `me.ts` and `net/store.ts` needed no changes (name/look read from `me.ts`, `?name=`
  already works, store shape preserved with `send` wired via `setState`).

## Files changed outside "Owns"

None. Owns-touched: `apps/web/src/net/{connection,predict,predict.test,interp,
interp.test}.ts` (new), `apps/web/src/net/Players.tsx` (stub filled in),
`apps/web/src/office/Avatar.tsx` (online branch added, offline frame untouched),
`e2e/multiplayer.spec.ts` (new), this report. (`net/` shows fully untracked because P1-C
is uncommitted in this shared checkout; my files are the ones listed here.)

## Requests

- `chat_history` race (P2-A/server, minor, zero impact today): the server sends it in
  `onJoin`, which can arrive before `attach()` registers handlers — the SDK warns and it
  is missed. Live `chat` is unaffected and rooms start empty. Suggest an explicit
  client-ready request or keeping history server-side until asked.
- `server.ts` still lacks `.filterBy(["workspaceId"])` (P1-C-owned, already requested by
  P2-A): all local joins share one room. Harmless here; multi-workspace isolation needs
  it before P3-B.
- Real-browser fps (acceptance item 3): done by the reviewer (see Evidence); no owner step needed.

## How to verify

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e
node /tmp/p2b-live.mjs        # needs 5175+2569 from: WEB_PORT=5175 PORT=2569 pnpm dev
node /tmp/p2b-online2.mjs     # click-move, sit/stand, UI look change
node /tmp/p2b-drop.mjs        # reconnect restores the same seat
```

- Online: open `http://localhost:5173/?name=Alice` twice (second with `?name=Bob`);
  walk in one, watch in the other; `__officeNet.status()` is `online` in both.
- Offline: stop the server, reload — office plays single-player, status `offline`.
- fps: in a visible Chrome open two windows against one server, walk in one, read the
  frame rate (target 60 with 2 players + 9 colleagues).

## Open questions

None for the owner. D3/D4/D6/D8 remain open but P2-B needs none of them.

## Next

Unblocks P3-A (shared colleagues render through `Players.tsx` npc slots already),
P3-C (web wiring: `send.chat/status`, `records_changed` refetch path is live), P3-D
(deploy smoke connects two browsers). Not started.

## Reviewer addendum (2026-11-01)

Re-verified every acceptance item in this session; all checks re-run fresh, all green:

- `pnpm typecheck --force`: 3/3 pass. `pnpm lint --force`: 3/3 pass.
- `pnpm test --force`: shared 107/14 files, server 36/7, web 24/5 (17 new net tests) pass.
- `pnpm build`: 2/2 pass. `pnpm test:e2e`: 2/2 pass in 4.2 m (multiplayer 2.2 m, smoke 1.9 m).
- Acceptance 1 (G3 two browsers move): proven by `e2e/multiplayer.spec.ts` plus the live
  headed run (both pills, net players Alice,Bob, status online in both windows).
- Acceptance 2 (offline unchanged): the `Avatar.tsx` diff vs HEAD removes only the three
  P1-A import lines; the offline frame gains only `isOnline()` early-return guards and
  never reads the online driving state. No test was changed or weakened.
- Acceptance 3 (fps): measured as above; the builder's "no display" caveat no longer
  applies (headed Chromium launches and uses the RTX 4050).
- Shared contracts hold: no `packages/shared` file touched by P2-B; client sends intents,
  click targets, activity and look/status/chat messages only (no positions); all inbound
  messages Zod-parsed; token in `client.auth.token`, never in join options; state via
  `getStateCallbacks`; net store shape matches the P1-C contract; `me.ts` untouched.
- Secrets: no tracked `.env`; no key/token patterns in the P2-B files.

Fix applied (one file, `apps/web/src/net/connection.ts`): the three terminal-offline
transitions (`stopNet`, failed `joinLoop`, exhausted `reconnectLoop`) now also clear
`players`/`npcs`. Before, a drop followed by a dead server left frozen remote avatars
standing in single-player; `reconnecting` still keeps them (by design) and `attach`
resets on every join, so reconnect behaviour is unchanged. Checks re-run after the fix.

Endorsed open requests for the lead (verified real, unchanged): the `chat_history`
attach race (P2-A/server, minor), `server.ts` missing `.filterBy(["workspaceId"])`
(P1-C-owned). Nothing committed; all reviewer lane processes killed, ports free.

## Review (2026-11-01, second pass — workflow re-verification)

Note: the workflow brief described this report as "Status partial" with fps as the
open item, but the tree already contains the reviewer addendum above closing all
three items as passed. This pass re-verified every acceptance item fresh.

Checks re-run in this session, all green:
- `pnpm typecheck --force`: 3/3 pass. `pnpm lint --force`: 3/3 pass.
- `pnpm test --force`: shared 107/14 files, server 49 passed + 2 skipped/9 files,
  web 24/5 (17 new net tests) — all pass.
- `pnpm test:e2e`: 2/2 pass in 4.4 m (multiplayer 2.4 m, smoke 2.0 m).

Acceptance items, verified against implementation bodies:
- Item 1 (G3 two browsers move): proven fresh by `e2e/multiplayer.spec.ts`
  (two contexts join, see each other's `remote-name` pill, Bob observes Alice move
  >0.8 m server-side). Connection code matches ARCHITECTURE.md 12.1/12.2: token in
  `client.auth.token`, validated `JoinOptions`, `getStateCallbacks`, SDK silent
  retry disabled with own backoff loop inside `RECONNECT_SECONDS` then fresh join.
- Item 2 (offline unchanged): `git diff` of `Avatar.tsx` removes only the three
  P1-A import lines; the offline frame gains only `isOnline()` early-return guards
  and never reads the online driving state. `me.ts` unmodified, net store shape
  matches the P1-C contract exactly. No test weakened (P2-B's tests are new files;
  the `interactions`/`routine` deletions are P1-A's move into shared).
- Item 3 (fps): the documented 111 fps measurement stands — I inspected the
  methodology (`/tmp/p2b-fps.mjs`: headed Chromium, two real joins, real-GPU
  renderer check, 10 s of rAF deltas while walking, mean/p50/p95) and viewed
  `/tmp/p2b-review-online.png` (Alice + remote Bob pill at spawn, colleagues
  present). Not re-measured in this pass (headed run pops windows; headless fps
  is not a GPU benchmark per HANDOFF.md). No other item is missing.

Contracts and edge cases: client sends intents/targets/activity/look/status/chat
only (no positions); all five inbound messages Zod-parsed; terminal-offline
transitions clear `players`/`npcs` (prior fix present); `attach` resets on every
join; `look_set` flushes from the online tick; `__officeNet` hook present. No
`packages/shared` file owned or touched by P2-B. Secrets: only `.env.example`
tracked; no key/token patterns in the P2-B files.

Fixes applied: none — no defects found. Verdict: passed. Nothing committed.
