# P3-E The demo, end to end — checkpoint report

Work package / gate: P3-E The demo, end to end (covers Gate G5 at e2e level)
Status: partial (my spec is green standalone and in-suite; the full `pnpm test:e2e`
fails only on the two pre-existing specs, with the identical contention
signature P3-C proved on the unmodified baseline — files outside this
package's Owns, so reported as Requests, not fixed here)

## Done

- **`e2e/demo.spec.ts`** (new): the `PROJECT_BRIEF.md` section 5 demo script in
  two browser contexts (Maya and Arjun) against the local stack with
  `FixtureLlm`, through the product UI:
  1. Both join (ready + online, co-presence in the net store, name pills both ways).
  2. Maya walks into the Acme room via the product click-to-move path; the wall
     display overlay shows the seeded status (Acme Corp, Implementation,
     "Go-live by 15 Nov", "Go-live · 15 Nov").
  3. Maya runs the meeting through the pipeline with the real MeetingBar
     "Process meeting" button; both drawers show "Approvals (4)" plus the
     meeting summary.
  4. Maya approves "Move milestone date", "Update commitment" and "New task",
     and rejects "Reassign task", one card at a time.
  5. After every decision both drawers show the new count with no reload
     (Arjun carries a `__demoNoReload` flag for the whole run).
  6. Arjun asks "What's the status of the Acme integration?" through the ask
     panel and gets an answer containing `2026-11-22` with listed sources.
  7. Arjun asks "Who is Acme's CEO?" and gets exactly
     "I don't have a record of that."
  8. The rejected reassign left its record untouched (`ownerId` still `maya`),
     checked over HTTP, while the milestone, commitment and new task changed.
  9. Maya reloads: ready + online again, drawer "My day", wall display
     "Go-live · 22 Nov", and the status question still answers `2026-11-22`.
- **`e2e/helpers/demo.ts`** (new): frozen demo constants (stable UUIDs and the
  two `DEMO_QUESTIONS`, citing `packages/shared/src/demo/index.ts`) and the
  spec's waits — `waitReady`/`waitOnline` (300 s / 240 s, `polling: 1000`),
  `walkToAcmeRoom` (walkable-resolved `move_target`), `freezeRender`,
  drawer/ask pollers, `askQuestion`, `openAcmeOverlay`, `serverBaseUrl`.
- **Backend choice: the deterministic in-memory repo.** The e2e server boots
  without `DATABASE_URL` (the config sets only `PORT`), so records plus
  `FixtureLlm` are fully deterministic with no Supabase dependency; the wall
  display's seeded 15 Nov state doubles as a freshness proof (a reused server
  would already show 22 Nov). Supabase mode was not needed: the package's
  assertions avoid dev-mode owned-task content per the P3-B note.
- **Contention design (this 4-vCPU SwiftShader box):** sequential loads with
  `?noao&noshadow`; 640x360 viewports (P3-C precedent); Arjun loads first on
  the quiet box and freezes his renderer immediately (1 s evaluate), so Maya
  loads and walks with the CPU to herself — this ordering cut the flow from
  1000+ s (frozen-late rehearsal) to 295 s; Maya freezes once she arrives.
  Every post-freeze pointer interaction uses `force` (Playwright's rAF-based
  stability check cannot run) **plus** an effect assertion, so a misdelivered
  click fails loudly instead of passing silently.

## Evidence

- `pnpm test:e2e e2e/demo.spec.ts`: 1 passed (5.0 m).
- `pnpm test:e2e` (full suite, alphabetical: demo, multiplayer, smoke):
  1 passed (demo) + 2 failed in 25.1 m. The failures are the exact P3-C
  baseline signature on files I never touched: multiplayer times out its
  60 s online `waitForFunction` (spec line 32; `test-results/.../error-context.md`
  confirms `Timeout 60000ms exceeded`), and smoke's browser dies after
  15.2 m (`Target page, context or browser has been closed` on the canvas
  check — the same 15.2 m P3-C measured). P3-C proved both fail identically
  with their changes stashed, so this is box contention, not a regression
  from any P3 package; my spec passes in-suite before them and cannot
  influence them (serial run, fresh browser per test, and it only dirties
  record state the other two never read).
- `pnpm typecheck`: 3/3 pass. `pnpm lint`: 3/3 pass. `pnpm test`: shared
  107, server 138 passed + 3 skipped (pre-existing placeholders), web
  89 passed + 4 skipped (the gated live-stack contract file) — all counts
  match the P3-C report; no test changed or deleted.
- New-file strict check: `tsc --noEmit --strict` over
  `e2e/demo.spec.ts` + `e2e/helpers/demo.ts` + `twoUsers.ts`: clean (the root
  `typecheck`/`lint` tasks do not cover `e2e/`; `eslint` on the two new files:
  clean too).
- Rehearsal probes (lane stack 5174/2568, kept in `/tmp`, not committed):
  `/tmp/p3e-probe1.mjs` (walk + overlay + button overlap discovery),
  `/tmp/p3e-probe2.mjs` (frozen-late: 391 s freeze evaluates, 995 s walk —
  abandoned order), `/tmp/p3e-probe3.mjs` (PASSED in 295 s, the committed
  order). Lane servers stopped afterwards; ports verified free.
- No existing test changed or weakened: `git status` shows only the two new
  `e2e` files plus this report.

## Deviations

- Maya "walks" via `__officeDebug.walkTo` (the same `walkTo` a floor click
  calls: server-routed `move_target`, server-authoritative, zone-gated
  MeetingBar) rather than held keys: steering keys across the map is a
  movement test (P2-A/P2-B cover it), not the demo's assertion, and the
  dilated client prediction under SwiftShader makes key steering unbounded.
- The wall display is asserted through the DOM overlay opened with
  `__wallDisplays.open("acme")` (the same `ScreenData` the TV texture draws)
  rather than clicking the 3D TV mesh: aiming at a 1 m screen at isometric
  distance in software rendering tests the camera, not the records.
- rAF is frozen once a page needs no more frames (P3-C's G5 precedent);
  socket, React, fetch and CDP do not use rAF, and every frozen click is
  effect-verified (see Done).
- The spec sets `test.setTimeout(900_000)` explicitly: the config default,
  kept visible with the 295 s measurement and 3x headroom. No other timeout
  in any existing file was touched.

## Files changed outside "Owns"

None. (`e2e/demo.spec.ts`, `e2e/helpers/demo.ts`, this report.)

## Requests

(Lead; both files are outside this package's Owns, so neither was edited.)

1. `e2e/multiplayer.spec.ts` line 32: raise the online `waitForFunction`
   bound from 60 s to 240 s (and pass `polling: 1000`: the default rAF
   polling stalls when frames take seconds). Measured justification: the
   60 s wait has now failed three consecutive contested runs (P3-C's 5.1 m
   with-changes and 5.0 m stashed-baseline runs, plus this run), while the
   demo spec's 240 s online wait passed on every join in probes 1–3 and
   both runner runs (12 joins, 0 failures).
2. `e2e/smoke.spec.ts`: the two default-viewport (1280x720) pages die at
   15.2 m twice running (`Target ... has been closed`). Measured
   suggestion: drop both pages to a small viewport (the demo spec's
   640x360 runs clean twice) and, if the death persists, run the two
   contexts' loads with an explicit small-viewport fixture. Same
   schedule-bound precedent: assertions unchanged.

## How to verify

- `pnpm test:e2e e2e/demo.spec.ts` (~5 min on the 4-vCPU box), then the full
  `pnpm test:e2e` (measured 25.1 min; alphabetical: demo, multiplayer, smoke).
- `pnpm typecheck && pnpm lint && pnpm test` (worktree root).
- Make sure nothing already listens on 5190/2590 first: the runner reuses an
  existing server (`reuseExistingServer`), and a dirty one would fail the
  spec's 15 Nov freshness check by design.

## Open questions

None.

## Next

G5 is proven locally; P3-D stays blocked on the owner's Fly/Vercel tokens;
P4-A/P4-B can start once G5 is approved. Nothing started.
