# FIX office-glitches: name tags, Ask close, typing, collisions, chair swivel

```
Work package / gate: FIX office-glitches (owner-reported, 2026-11-03; not a planned package)
Status: passed
Branch: fix/office-glitches (worktree .worktrees/fix-avatar-sync), on top of fix/avatar-sync
```

The owner asked for five glitches to be fixed, the open items of FIX avatar-sync to be closed,
and everything to be merged to `main`.

## Done

1. **Name tags over the panels.** The name pills are drei `Html` with z-index up to 20, in the
   same stacking context as the panels, so they drew over My day, chat and Ask. The canvas
   wrapper now isolates its own stacking context (`isolation: isolate` in `OfficeScene`). The
   pills still order among themselves, but stay under every panel and the HUD.
2. **Ask had no close button.** Ask the office now closes to a small "Ask the office" button,
   like the chat, and reopens without the old answer.
3. **Typing went through the desk.** Measured in the page on six typists: the typing move put
   the elbows over the desk (0.18 to 0.27 m ahead of the hips; the edge is at 0.15) and up to
   6.4 cm below its top. `keepHandsOnDesk` raised only the wrists. A hand on the desk now also
   keeps its elbow at least `ELBOW_CLEAR` (4.5 cm) above the top, placed on the arm's reach
   circle as near as it can be to where the move put it. The forearm then clears the desk all
   along. After the fix: 0 cm into the desk for all six, and the hands type where they did.
4. **Characters walked through each other.** The walk map knows walls and furniture, not
   people. `keepApart` (shared sim) drops the part of a move that would bring two people closer
   than `PERSON_GAP` (0.5 m), so they slide past. When someone is right in the way, the mover
   sidesteps to its right: someone standing still is walked round, and two people meeting head
   on both keep right and pass. Moving out of an overlap is always allowed. People in a chair are
   in nobody's way, because neighbours at a desk sit closer than the gap.
   - The room steps each player against the other players and the colleagues. The client
     predicts against them as last synced, so a near miss with someone moving costs at most a
     small eased correction.
   - Colleague routines keep apart the same way. After 2.5 s held up (a corridor too narrow to
     share) they go past anyway, so nobody waits forever.
   - Offline, the avatar and the local colleagues see each other through a small registry. A
     clicked route is given up only for a wall in the way, not for a colleague.
5. **The chair should turn with the sitter.** A sitter backs onto the chair from its side and
   swivels to the desk; the chair stayed facing the desk and cut through them. `Person` reports
   anyone in a chair pose (you, others and colleagues alike). `Swivel` turns that task chair to
   them as they sit, follows them round to the desk and back (under 9 degrees behind), and turns
   it back to its desk a second after they leave. `Furniture` rewrites the instance matrices of
   that chair part only while one is turning.

### Open items of FIX avatar-sync, closed

- **Late release:** a release reaching the room just after a tick left it one held-key step past
  where the client stopped (an 11.5 cm glide). `InputQueue` now remembers the state before each
  borrowed step and undoes the steps when the late input carries other keys (a release, Shift,
  a click). Tested with a seeded 0 to 30 ms network delay on the Windows timer grid, keys
  pressed and released repeatedly, at all 50 phase offsets: the room stays exactly on the
  prediction.
- **Release and click in one tick:** `Avatar.onlineTick` no longer sends a release after a click
  while the keys were still marked held. That release cleared the route after one step.
- **turbo `spawn UNKNOWN`:** transient. It happened right after `pnpm install` rewrote the turbo
  binary (most likely Windows scanning the new 50 MB exe) and cleared by itself. `pnpm
  typecheck`, `lint` and `test` run through turbo again. Noted in HANDOFF section 4 quirks.
- **ARCHITECTURE 12.1** now describes the fixed step, the per-tick patch, the input queue, the
  reconciliation and the paced remote snapshots as built.

### Found on the way

- `pnpm test` failed on `main` too whenever a dev server was up on 2567. AuthGate's test
  connected to it, and undici's WebSocket threw in jsdom (`ERR_INVALID_ARG_TYPE`, 2 unhandled
  errors). Unit tests now point `VITE_SERVER_URL` at a closed port (`apps/web/vite.config.ts`).

## Evidence

- `pnpm typecheck`, `pnpm lint`, `pnpm test` through turbo, with the dev servers running:
  shared 119, web 178 (4 skipped: live-stack contract), server 187 (3 skipped: placeholders of
  the local-Supabase tests, whose real versions ran), scripts 9. All passed.
- New tests (written before the code, except `chairs.test.ts`, written with it):
  `sim/apart.test.ts` (10), `routine.test.ts` (+2: colleagues pass head on; wait in a narrow
  corridor, then give way), `inputs.test.ts` (+3: undo on a late release, no undo once paid,
  random network delay), `deskReach.test.ts` (3), `chairs.test.ts` (6), `AskPanel.test.tsx` (+1).
- `pnpm test:e2e`: 8 of 8. The full run passed 7 (9.7 min); the demo spec failed there because the
  new Ask close button was labelled "Close ask the office", and the demo helper's
  `getByRole("button", { name: "Ask" })` matches names by substring. Relabelled "Close" (no
  e2e step matches it), and the demo spec then passed (2.7 min).
- Live checks against the running app (scratchpad probes, not committed):
  - Collision, two clients on a real room: head on, closest 0.504 m and both arrived; walking
    past someone standing, closest 0.50 m and arrived.
  - Typing: deepest part of an arm inside the desk, six typists. Before: 3.7, 5.0, 1.6, 6.4, 0
    and 4.0 cm. After: 0 for all, elbows at 0.795 m (top 0.75 + 0.045).
  - Name tag under My day: at Arjun's tag inside the drawer, the topmost element is the panel.
- Screenshots, compared with `docs/reference/office-reference.png` (only poses and chair turns
  changed; the look is unchanged), in `docs/screenshots/fix-office-glitches/`:
  `typing-before.png`, `typing-after.png`, `chair-swivel-sit-seated-typing.png` (sitting down,
  landed on the seat, typing), `name-tag-under-my-day.png`.

## Deviations

- Shared contracts changed, at the owner's request: `stepPlayer` takes the other people
  (optional, defaults to none); new `keepApart`, `inTheWay` and `PERSON_GAP` in
  `packages/shared/src/sim`; `RoutineWorld.others` and `Routine.waited` (optional) in
  `people/routine.ts`. Callers that pass nothing behave as before.
- Client and server agree exactly on collisions only when the others stand still. Near someone
  moving, the client predicts against their last synced position, and the server's word arrives
  as a small eased correction.

## Files changed outside "Owns"

Not a planned package; the owner asked for these fixes directly. Areas: P2-A
(`apps/server/src/room/**`), P2-B (`apps/web/src/net/**`, `Avatar.tsx`), the office scene
(`apps/web/src/office/{OfficeScene,Person,Furniture,Colleagues,deskReach,chairs,state}`), UI
(`apps/web/src/ui/{AskPanel,panels.css}`), `apps/web/vite.config.ts`, the shared sim and people
contracts, and the lead's docs (ARCHITECTURE 12.1, HANDOFF section 4).

## How to verify

```
pnpm typecheck && pnpm lint && pnpm test
pnpm test:e2e
pnpm dev     # walk into colleagues; sit at a desk (click a chair) and watch the chair; ask, then close
```

## Open questions

None for these fixes. The owner has further project and operational changes to come.
