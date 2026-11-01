# P2-F Product panels — report

Work package / gate: P2-F Product panels
Status: passed

## Done

- Panels (`apps/web/src/ui/`, layout from DESIGN_SPEC.md 9): participants (top-left,
  collapsible, net store + self status picker), chat (bottom-left, collapsible, net
  store, validated with shared `ChatSend`), ask (bottom-centre single line, expands
  upwards, validates with shared `AskRequest`/`AskResult`, sources or no-record state),
  right drawer (My day, replaced by approvals while changes are pending, with a tab
  back; collapsible).
- Approval drawer: meeting summary view (summary + decisions), before/after rows per
  change (owner keys and demo project/account ids resolved to names), needs-review
  badge, approve/reject; a conflicting decision refreshes the list with an
  "Already decided" notice instead of failing silently.
- "Process meeting" action, shown only while the zone from `useOfficeUi` is the Acme
  room; processes the `acme-sync` fixture through `api` and refetches every records
  slice (result validated with shared `MeetingProcessResult`).
- Notices (top-centre): Demo-data pill in mock mode, connecting/reconnecting pills,
  latest server error (polled from the connection module state, dismissible), records
  load errors with retry.
- Layout: control hint moved to top-centre under the room pill and shortened to one
  line; "Customise look" moved to bottom-right with its panel opening above it;
  drawer ends above the look button so nothing overlaps; scene centre stays clear and
  clickable (`pan-root` lets clicks through outside the panels).
- Typing/movement guard: panels swallow the avatar's movement keydowns (never keyups,
  so held keys cannot stick) on top of the avatar's own input guard.
- All reads go through the records and net stores; actions through `api` (the mock
  until P3-C); no `fetch`, no new wire payload types. Process/approve/reject disable
  while pending (no double submit). Offline single-player mode unchanged (chat and
  status disable with hints; panels render from the mock).
- `window.__panelsDebug` (DEV only): `{ processMeeting, ask }` for screenshots and
  later e2e driving.

## Evidence

- `pnpm typecheck`: 3/3 pass. `pnpm lint`: 3/3 pass. `pnpm build`: ok.
- `pnpm test`: web 44/44 pass (20 new P2-F: format 8, AskPanel 3, ApprovalsPanel 3,
  approvalConflict 1, panels 5); shared 107/107 pass. Server: every test file passes
  but the runner exits 1 on the pre-existing vitest-pool crash — reproduced on the
  untouched `src/server.test.ts` alone (2 pass, exit 1, `/tmp/p2f-server-alone.log`);
  P2-F touches no server files (same crash as P2-E reported).
- Live exercise on lane ports (web 5175, server 2569): walked (server-authoritative)
  into the Acme room — room pill and "Process meeting" appeared; clicked it —
  Approvals (4) with meeting summary; clicked Approve x3 then Reject — drawer stepped
  4→3→2→1→My day with "Go-live by 22 Nov"; ask returned a 3-source answer.
  Flow log: `["Approvals (4)","Approvals (3)","Approvals (2)","Approvals (1)","My day","myday-updated"]`.
- Screenshot (1440x810, panels open, centre clear): `/tmp/p2f-panels.png` — kept in
  /tmp because `docs/screenshots/` is outside Owns (see Requests). Captured with a
  /tmp copy of `screenshot.mjs` adding `--no-sandbox` (repo script untouched),
  `?noao&noshadow` for headless speed, and an async-IIFE `--before` (Runtime.evaluate
  rejects top-level `await`): walk to the room, click Process, ask the status
  question. Command in "How to verify".

## Deviations

- Drawer `bottom: 64px` (not full height) so the bottom-right "Customise look" button
  is never covered; the open look panel paints above the drawer (`z-index`, temporary
  while customising). No overlap in any state.
- Hint text shortened (Hud.tsx is owned): "WASD or arrows to walk · Shift to jog ·
  click to move · E to sit or drink · scroll to zoom".
- Approvals keep a "My day" tab; the default view still switches to approvals while
  anything is pending, per spec.
- "Fixture mode" notice is a "Demo data" pill when `VITE_API != http`: the web cannot
  see the server's LLM mode, the mock API is the fixture the user experiences.

## Files changed outside "Owns"

None. (`apps/web/src/ui/**`, `apps/web/src/office/Hud.tsx`,
`apps/web/src/office/office.css`, LookEditor positioning via `office.css` only,
`docs/reports/P2-F.md`.)

## Requests

- Lead: copy `/tmp/p2f-panels.png` to `docs/screenshots/panels-p2f.png` (outside my
  Owns) if the screenshot should live in the repo.
- Lead/P1-B: `screenshot.mjs` needs `--no-sandbox` on this Ubuntu box (Chrome refuses
  the sandbox: unprivileged user namespaces blocked) — I used a /tmp copy.
- Carried over, pre-existing (also in the P2-E report): the server `vitest run` pool
  crash (`tinypool`/`ERR_INVALID_ARG_TYPE` after all files pass).
- Observed, not mine: browser console shows `@colyseus/sdk: onMessage() not
  registered for type 'chat_history'` (P2-B area); drei colleague name pills can paint
  above the drawer (overlay z-order, pre-existing).

## How to verify

```bash
cd <worktree>   # branch wp/P2-F-panels
pnpm typecheck && pnpm lint
pnpm --filter @office/web test     # 44 pass (server suite has the pre-existing pool crash)
WEB_PORT=5175 PORT=2569 VITE_SERVER_URL=http://localhost:2569 pnpm dev
```

- Open `http://localhost:5175/`; walk into the Acme room (customer room, rear-left);
  "Process meeting" appears top-centre. Click it, approve three changes, reject one;
  My day and ask show the result. Typing anywhere never moves the avatar.
- Screenshot (needs `CHROME` pointing at the Playwright chromium + the /tmp
  no-sandbox copy; see Evidence): the exact `--before` is in `/tmp/p2f-shot.py`.

## Open questions

None.

## Next

P3-C web wiring and sign-in (starts after P2-B/P2-F/P2-G; finishes after P3-B) and
P3-E demo e2e are unblocked by this package; not started.

---

## Reviewer addendum (independent verification, 2026-11-01)

Branch `wp/P2-F-panels`, reviewed at commit `571ca5f`. I read every owned
implementation and test body listed below (not just search output) and re-ran
all checks fresh from the worktree root.

Files read in full: `apps/web/src/ui/{Panels,Participants,ChatPanel,AskPanel,
MyDayPanel,ApprovalsPanel,RightDrawer,MeetingBar,Notices}.tsx`,
`{actions,format}.ts`, `panels.css`, `{format,AskPanel,ApprovalsPanel,
approvalConflict,panels}.test.{ts,tsx}`, plus the `Hud.tsx`/`office.css` diff.

Checks re-run (results):
- `pnpm typecheck`: 3/3 pass.
- `pnpm lint`: 3/3 pass.
- `pnpm --filter @office/web test`: 10 files, 44/44 pass (20 new P2-F tests).
- `pnpm --filter @office/shared test`: 14 files, 107/107 pass.
- `pnpm build`: ok (web built in ~6s).
- Full `pnpm test`: server suite fails only on the pre-existing vitest tinypool
  teardown crash (`ERR_INVALID_ARG_TYPE` after results); I confirmed all 8
  server test files pass individually. P2-F owns no server files, so this is
  out of scope (same crash as the P2-E report).
- `git diff --name-status main...HEAD`: 12 added + `Panels.tsx` (slot stub to
  implementation) under `apps/web/src/ui/`, `Hud.tsx` (one hint-text line),
  `office.css` (hint/look/review-sheet positioning only), `docs/reports/P2-F.md`.
  All within Owns; LookEditor moved via CSS only.
- No existing test changed or weakened: every test file in the diff is new
  (`A` status); no `M` on any test file.
- No secrets committed: no secret-ish strings in `apps/web/src/ui/`; no
  `.env` changes.
- No `fetch(` in `apps/web/src/ui/` (only `refetch` store calls) — task 5 holds.
- Mock conflict message (`mock.ts:215`, "is no longer pending") matches the
  ApprovalsPanel refresh regex; the conflict test genuinely exercises it.
- Screenshot `/tmp/p2f-panels.png` inspected: 1440x810 PNG, panels open
  (People, Chat, Ask with sourced answer, Approvals (4) with meeting summary
  and before/after cards), scene centre clear, no overlaps.

Verdict per acceptance item:
1. Process meeting, approve three, reject one; My day and ask show the result
   — PASS. Proven by the ordered `ApprovalsPanel.test.tsx` flow (real mock api
   + real records store: 4→3→2→1→My day with "Go-live by 22 Nov"), the
   Acme-room gating test in `panels.test.tsx`, and the cited-answer/abstain
   tests in `AskPanel.test.tsx`; all re-run green above.
2. 1440x810 screenshot with panels open, centre clear — PASS (inspected;
   lives in /tmp per the builder's Owns-correct request to the lead).
3. Checks pass — PASS (typecheck, lint, web, shared, build; server crash is
   pre-existing infrastructure, untouched by this package).

Task-by-task: participants/chat/ask/My day/approvals (before-after,
approve/reject, needs-review, conflict refresh), Acme-room Process meeting +
meeting summary, fixture/reconnecting/error notices, ask sources/no-record
state, hint + Customise-look repositioning, keydown (not keyup) movement guard
with test, and pending-disables on process/approve/reject/ask — all present
in the bodies read.

Fixes applied: none (no defects found).
Processes started: none (no dev servers needed; none left running).
Status: passed.
