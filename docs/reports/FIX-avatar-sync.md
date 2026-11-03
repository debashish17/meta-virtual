# FIX avatar-sync: the playable character glitches while walking

```
Work package / gate: FIX avatar-sync (owner-reported bug, not a planned package)
Status: passed
Branch: fix/avatar-sync (worktree .worktrees/fix-avatar-sync), from main 99037bc
```

## The bug

Reported by the owner on 2026-11-03: "the playable character is glitching when I move it from
one point to another; the NPCs walk smoothly." Only the local avatar was affected: it is
predicted and reconciled. Remote people and NPCs are drawn from the snapshot buffer.

Four causes, each measured before fixing (probe numbers below):

1. **The room ran at 16 Hz on Windows.** `setSimulationInterval(tick, 50)` and
   `setPatchRate(50)` use `setInterval(50)`, which Windows rounds up to its 15.625 ms timer:
   it fires every 62.5 ms (measured 62.1 ms mean). The room walked players at 1.84 m/s, while the
   client predicted 2.3 m/s. On a click-walk the avatar ran up to 1.4 m ahead, and the next
   click snapped it back (1.15 to 1.5 m jumps measured).
2. **The room kept only the newest input of a tick** (`rec.fresh` was overwritten). The client
   predicts one step per input, so two inputs landing between ticks lost a step, and an empty
   tick re-applied the held keys for an extra step. The server was 1 to 2 steps off the
   prediction all the time.
3. **Reconciliation never corrected the prediction.** `reconcile` added the error to a display
   offset that decayed back to the uncorrected sim: the avatar jumped by the error and slid
   back over 100 ms, and the same error came back on every snapshot. With held keys, 230 of 353
   frames drew the avatar stepping backwards. ARCHITECTURE 12.1 says the error is "added to the
   current prediction over about 100 ms".
4. **The avatar was drawn only at the 20 Hz ticks.** `Avatar.tsx` drew `p.pos()`, the position
   after the latest tick, while the camera and the walk cycle move every frame: 62% of frames
   did not move during a click-walk, then jumped 11.5 cm. ARCHITECTURE 12.1 says the client
   "renders between ticks".

## Done

- `apps/server/src/room/fixedStep.ts` (new): `FixedStep` turns wall-clock time into whole
  `TICK_DT` steps (max 5 catch-up steps, then the backlog is dropped).
- `apps/server/src/room/inputs.ts` (new): `InputQueue` queues movement inputs and applies
  exactly one per tick, in order (newest 4 kept). While nothing is queued, the held keys are
  re-applied, as before, and counted as borrowed (up to 2). A late input with the same keys is
  then acknowledged without a second step, so the position at `lastSeq` stays exactly on the
  prediction. Never more than one step per tick, so sending faster gains no speed.
- `office.room.ts`: polls `FixedStep` every 5 ms through `setSimulationInterval` (Colyseus still
  owns the timer's lifecycle). It sets `patchRate = null` and calls `broadcastPatch()` after each
  batch of ticks, so every snapshot is the state of the tick that set its `lastSeq`. Movement
  handlers push to the queue. A teleport now also drops held keys (the client resets to standing
  there too).
- `apps/web/src/net/predict.ts`: `reconcile` moves the prediction by the error at once, and
  also every stored prediction from `lastSeq` on, so inputs still in flight do not report the
  same error again. The drawn avatar eases onto it over `CORRECTION_MS` (via an offset), or
  jumps on a snap. New `draw(alpha)`: interpolates between the last two ticks. `pos()` and
  `pending()` keep their meaning, and the six existing tests pass unchanged.
- `apps/web/src/office/Avatar.tsx`: draws `p.draw(online.acc / TICK_DT)`.
- `apps/web/src/net/interp.ts` + `Players.tsx`: `ArrivalPacer` stamps remote snapshots one
  tick apart, drifting slowly towards arrival times. With one patch per tick on the 15.625 ms
  grid, patches arrive 40 to 65 ms apart, and raw arrival stamps would have made remote people
  pulse (11% frame-to-frame speed variation measured). With the pacer it is 0.9%.

## Evidence

Unit and integration tests (written first; the new ones failed before the change, for the
reasons above):
- `fixedStep.test.ts` (4): 20 steps a second on a 15.625 ms poll and on a 62.5 ms interval;
  backlog dropped after a stall.
- `inputs.test.ts` (10): ordering, held keys, borrowed steps, cap, overflow, clear. Also a
  jitter simulation: the client sends every 50 ms and the server ticks on the Windows grid, at
  all 50 one-ms phase offsets. Every input is acknowledged with the server exactly on the
  client's prediction (error 0).
- `office.room.test.ts` (+2): walks at `WALK_SPEED` in wall-clock time (was 1.89 m/s against a
  1.955 floor on this machine), and three inputs sent together are each applied once (the old
  room moved 0 steps).
- `predict.test.ts` (+5): the correction is taken at once but drawn eased; inputs in flight are
  not corrected twice; drawing between ticks; a snap moves the drawn avatar by the whole error;
  reset.
- `interp.test.ts` (+3): the pacer spaces Windows-grid arrivals 48 to 52 ms apart; it restarts
  after a gap; it stays ordered and at most one tick ahead in a burst.

Checks (run per package: `turbo` does not start on this machine, see Open questions):
- `pnpm --filter @office/{server,web,shared} typecheck` and `lint`: clean.
- server `vitest run`: 184 passed, 3 skipped (placeholders of the local-Supabase tests, whose
  real versions ran). Web: 168 passed, 4 skipped (the live-stack contract). Shared: 107 passed.
  `pnpm test:scripts`: 9 passed.
- `pnpm test:e2e` (from the worktree): 8 passed in 8.0 min (main earlier today: 8 passed in 10.3 min;
  the demo and multiplayer specs are faster now that walking is not slowed to 80%).

Probes (Node scripts driving the app's own `Predictor`, `SnapshotBuffer` and `ArrivalPacer`
against a real room at 60 Hz frames, in the session scratchpad, not committed). "main" means
the main server and main client code; "fix" means this branch.

| Local avatar | main | fix |
|---|---|---|
| Held keys: drawn step per frame (should be 0.038 m) | p10 0.052, p90 0.172, max 0.265 | 0.038 / 0.038 / max 0.048 |
| Held keys: frames drawn stepping backwards | 230 of 353 | 3 (the 3 real turnarounds) |
| Held keys: reconciles with an error | 114 of 114 (0.115 to 0.23 m) | 0 of 119 |
| Click-walk: frames with no movement | 61.6% | 0% |
| Click-walk: snaps | 1 (1.27 m) | 0 |

| Remote person, walking | main | fix |
|---|---|---|
| Patch gaps | 60 to 65 ms | 40 to 65 ms (one per tick) |
| Drawn speed (should be 2.3 m/s) | 1.84 m/s | 2.30 m/s |
| Frame-to-frame speed variation | 3.8% | 0.9% (11% without the pacer) |

## Deviations

- ARCHITECTURE 12.1 names `setSimulationInterval(..., 1000 / TICK_HZ)` and
  `setPatchRate(1000 / TICK_HZ)`. Both are kept in spirit (a fixed 20 Hz tick, 20 patches a
  second), but implemented as a 5 ms poll of a fixed-step accumulator with one patch per batch,
  because the literal calls give 16 Hz on Windows.
- Held keys are still re-applied when no input is queued. A client that stops sending for
  longer than 2 ticks walks on uncounted, as before, and reconciles as a correction.

## Files changed outside "Owns"

This is not a planned package. The files belong to P2-A (`apps/server/src/room/**`) and P2-B
(`apps/web/src/net/**`, `apps/web/src/office/Avatar.tsx`). No shared contract
(`packages/shared/src/{net,api,sim,demo}`), store shape or dependency changed.

## Requests (lead)

- Update ARCHITECTURE 12.1: the tick and patch lines (as under Deviations), and that the room
  queues movement inputs and applies one per tick.
- After merging: tell lanes with open branches on `apps/server/src/room/**` or
  `apps/web/src/net/**` to rebase.

## How to verify

```
pnpm --filter @office/server test     # fixedStep, inputs, office.room
pnpm --filter @office/web test        # predict, interp
pnpm test:e2e
pnpm dev                              # walk Maya with WASD and by clicking; compare with main
```

## Open questions

- `turbo` fails to start on the owner's machine (`spawn UNKNOWN`, even `npx turbo --version`).
  So `pnpm dev`, `pnpm test`, `pnpm lint` and `pnpm typecheck` fail there. The checks above ran
  per package. Likely Windows security blocking the turbo binary; not investigated.
- Seen while reading `Avatar.onlineTick`, not changed: releasing the keys and clicking within
  the same 50 ms tick sends the target and then the release on the next tick. The release clears
  the route on both sides, so that click-walk stops after one step. It is rare, and it is a
  client input question for P2-B.
- A release that reaches the room just after a tick, while it re-applied the held keys, leaves
  the room one step past where the client stopped. The client then eases 11.5 cm forward. In the
  jitter simulation this never happens at any phase; in practice it needs a late release with no
  input backlog.

## Next

Nothing started. Ready for the lead to review and merge.
