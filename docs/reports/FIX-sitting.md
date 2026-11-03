# FIX sitting: stuck after standing up, and a clear way to sit and stand

```
Work package / gate: FIX sitting (owner-reported, 2026-11-03; not a planned package)
Status: passed
Branch: fix/office-glitches (worktree .worktrees/fix-avatar-sync), after the office-glitches merge
```

The owner reported: "after sitting in the chair Maya is stuck, she is not moving; there should be
a better UI for sitting than just clicking it with the mouse."

## The bug

Standing up leaves you beside the chair. That spot is inside the walk map's no-go margins (the
desk's and the chair's) at all 96 desk seats, for every body height. `WalkMap.step` refuses any
step from an unwalkable spot, so the keys could not move you. A click still worked, because
`findPath` starts from the nearest walkable point. Standing up with E ends in the aisle (the room
walks you out), but standing up by pressing a walking key ends beside the chair, which is the
stuck case. This predates today's changes.

## Done

- **Walk off from anywhere you stand up.** `WalkMap.depth` (how far a point is inside the no-go
  area) and `WalkMap.canStep`: from inside a margin, a step may go out of it or along it, never
  deeper. `step` and `keepApart` use it. Client and server share the rule, so prediction agrees.
- **Say what E does, and let you click it.** A chip under your feet, clickable, with the oak key
  cap: "E Sit down" or "E Get a drink" near a free chair or the counter, with a halo on the chair
  (or a ring at the counter) it means; "E Cancel" while you walk there; "Sitting down…" and
  "Standing up…" while the moves play; "E Stand up" once seated; "E Step away" at the counter. The
  pointer turns to a hand over a free chair or the counter, and clicking one still works. Offline,
  E now also calls off a walk to a chair.
- **Never offer a chair the room will refuse.** The room syncs its reservation set
  (`OfficeState.taken`: players' and colleagues' seats and spots). The client also skips seats
  someone near is using, and remembers a refusal for 30 s, so E, a click and the chip agree. Before
  this, the chip offered an absent colleague's desk and the room answered "target is taken".

## Evidence

- New tests, written first:
  - `walk.test.ts` (+3): walk out of a margin and not further in; move along it at the same depth;
    still never end inside an obstacle from the floor.
  - `activity.test.ts` (+1): at every desk seat, walking straight back from the desk after standing
    up reaches open floor, and no key takes you deeper. This failed before the fix: 0 m moved.
  - `action.test.ts` (7): the chip's action for every phase, online and offline.
  - `office.room.test.ts` (+1): a client's `taken` equals the room's reservations (colleagues'
    desks included), and a new reservation reaches it.
- One of my own new tests changed before it ever passed. "Cannot slip along inside a margin" became
  "may move along it at the same depth". The strict rule left people stuck between a desk and a
  chair, where stepping straight back from the desk runs along the chair's margin.
- Turbo checks: shared 123, web 185 (4 skipped), server 188 (3 skipped), scripts 9. All passed.
- In the browser (a test copy of the app on spare ports):
  - Clicking the chip sat the player down, with the chip going "Sit down", then "Sitting down…",
    then "Stand up".
  - E stood her up ("Standing up…"). Afterwards the keys walked her 1.8 to 1.95 m per 0.8 s in
    every direction.
  - Holding S while seated stood her up and walked her off (1.86 m in the final second).
- `pnpm test:e2e`: 8 of 8 passed (9.3 min).
- Screenshot: `docs/screenshots/fix-office-glitches/sit-chip-offer-and-seated.png`.

## Deviations

- Shared contract changes, at the owner's request: `WalkMap.depth` and `WalkMap.canStep`, and a
  looser `step` from inside a margin; `OfficeState.taken` in the room schema;
  `getReserved()` in `apps/web/src/net/connection.ts` (the store's shape is unchanged).
- Standing up still takes about 3 s (the swivel plus the Mixamo stand-up move), and about 1.3 s
  more when the room walks you out to the aisle. The chip says "Standing up…" meanwhile. Shortening
  it would change the shared activity timing; not done unless asked.

## How to verify

```
pnpm typecheck && pnpm lint && pnpm test
pnpm test:e2e
pnpm dev   # walk up to a desk chair: "E Sit down" under your feet and a halo on the chair;
           # click it (or press E), then "E Stand up"; or just walk away with the keys
```
