# P6-E Office-life demo

Work package / gate: P6-E Office-life demo
Status: passed
Done:
- `e2e/office-life.spec.ts` (new): Maya and Arjun check in (OfficeLifeBar) and walk to their home desks, each observed seated and typing (pose `type` within 1.5 m of the frozen desk seats) with the team pill and Working status; Maya books the Acme room with Arjun + agenda via the BookingPanel UI and walks in on create; Arjun's invite (Join) walks him in; then the demo script unchanged from "Process meeting" — process via the real button, agenda above the summary, approve three / reject one with live drawer-heading waits on both pages, drawer receipt + wall receipt on the second user's views with a no-reload flag, cited status answer, CEO abstention, record-untouched API checks, reload restores state.
- `docs/DEMO_VIDEO.md`: the same story as numbered presenter scenes with lines to say and what the viewer sees (check-in, booking, invite/join, wall, process, approve, live wall receipt, ask, close); the deployed-URL run and the two-real-browsers manual pass are marked as owner steps (no deploy in this session).
Evidence:
- `pnpm typecheck` 3/3, `pnpm lint` 3/3, `pnpm test` green (server 275 + 7 skip, web 237 + 4 skip, scripts 18).
- `npx playwright test office-life`: 1 passed (6.6m). `demo.spec`: 1 passed unchanged (2.1m, `git diff` empty). `status.spec`: 1 passed (2.6m). `receipts.spec`: 1 passed (38.9s). `meetings.spec`: 2 passed (7.0m). Each run separately with a fresh servers; the new spec also tolerates the shared-server full-suite order (see Deviations).
- Screenshots (visually inspected): `C:\tmp\p6e-checkin.png` (Maya seated typing at her Customer success desk, Working), `C:\tmp\p6e-invite.png` (Arjun's "Maya invited you to Acme go-live sync in Acme room" invite with Join), `C:\tmp\p6e-receipt.png` (Arjun's Acme wall: "LATEST RECEIPTS — Go-live 15 Nov → 22 Nov · Acme sync · Maya").
- Scratch stacks used free ports 5181/2581 (+ relaxed heartbeat); e2e used its own 5190/2590. No other agent's process touched; my stack processes stopped and ports verified clear afterwards.
Deviations:
- `docs/DEMO_VIDEO.md` already existed (P4-B's backup-video script), so it was extended with the office-life scenes + owner steps rather than created new.
- Two setup calls keep the story exact anywhere in a shared-server full run (meetings' agenda test leaves 4 pending): open bookings are ended first (else a 409), and leftover pending changes are rejected before "Process meeting", so the drawer reads Approvals (4..0) exactly as in demo.spec. The pre-process wall check asserts the status overlay but not the seeded 15 Nov date (demo.spec owns the fresh-state proof); the hero receipt line persists across meetings so it reads the same standalone and in a full run.
- The drawer receipt is asserted after the first approval (Approvals (3)): the Decided history renders in ApprovalsPanel, which replaces My day only while changes are pending.
- One story assertion added beyond the four named: the booking agenda is visible above the meeting summary (proves the booking travelled with the meeting).
- First run failed 401 because this session's tool output redacts dev tokens as `[REDACTED]` and the redacted text was copied into the spec's auth headers; fixed to the real `dev:Maya` token (bytes verified against meetings.spec) and the API helpers now fail loud with status + body.
Files changed outside "Owns":
- `docs/reports/P6-E.md` (this report). Nothing else: no source file, no other lane's file; `e2e/demo.spec.ts` diff is empty.
Requests:
- None.
How to verify:
- `pnpm typecheck`, `pnpm lint`, `pnpm test`
- `npx playwright test office-life` (fresh servers), then `npx playwright test demo.spec.ts status.spec.ts receipts.spec.ts meetings.spec.ts` (serially; each boots fresh servers)
- Read `docs/DEMO_VIDEO.md`; open the three `C:\tmp\p6e-*.png` screenshots
Open questions:
- None for the lead. Owner decisions D14/D4/D9 and the two DEMO_VIDEO owner steps stay with the owner.
Next:
- Gate G8 (this package closes Phase 6); P4-C rehearsal on the public URL; the owner records the backup video from `docs/DEMO_VIDEO.md`. Not started.
