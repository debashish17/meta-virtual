# P6-B Meetings in the rooms

Work package / gate: P6-B Meetings in the rooms
Status: passed
Done:
- Store + routes: create (bookable zone, one open booking per zone else 409 room_busy, invitee in workspace else 400, virtual refused 400), list open, end (host only else 403, unknown 404). Create sends bus.meetingInvite + records_changed bookings; end broadcasts records_changed. In-memory and Postgres stores.
- Migration 20261103000100_bookings.sql: bookings table + meetings.agenda + meetings.booking_id; RLS members-read, write grants revoked, one-open-per-zone partial unique index. Applied forward-only to local Supabase (additive; no reset).
- rooms.ts (new): BOOKABLE_ZONES (all meeting/customer/project zones), ROOM_ENTRY (walkable point inside each door), isBookableZone. Tests: walkable, inside zone, reachable from spawn.
- BookingPanel: free rooms (busy greyed with title), title, agenda, invitees from office people (DEMO_PEOPLE offline); host walks to room on create; invite "Maya invited you to <title> in <room>" with Join (walks to ROOM_ENTRY + in_meeting) / Not now; open list with Join for late joiners + host End meeting.
- Agenda: POST /meetings with bookingId stores agenda; drawer shows it above the summary; extraction context carries it; fixture output byte-identical. End meeting frees the room.
- Cut-first dropped per plan: virtual meetings (400, needs LiveKit + /calls/token); meeting-room-chair sitting (P6-D).
- Lead wiring R1-R4 (see Deviations).
Evidence:
- Builder: typecheck/lint/test green (shared 142, server 240 + 5 skip, web 223 + 4 skip); meetings.spec T1 green (6.3m), T2 red at the predicted R1 line; demo.spec green unchanged (2.1m). Fixed a real 640px pill overlap that swallowed demo.spec's 2nd approval (bisect-proven). Screenshots /tmp/p6b-booking.png, /tmp/p6b-join.png.
- Reviewer: CONDITIONAL PASS (R1 outstanding, no builder must-fix). Re-ran rooms 4/4, server bookings 25, web bookings 8/8; 2 pg-live suites skipped (Supabase unreachable in review sandbox).
- E2E agent: CONDITIONAL PASS. Checks green; T1 green (6.2m); T2 red at spec line 141 as predicted; demo.spec green unchanged (2.3m, diff 0 lines). Live probes: 201 + invite + Join walks in + busy 409 + end frees + rebook. Screenshots C:\tmp\p6b-e2e-1/2/3.png inspected.
- Lead after R1-R4: routes 12/12 + meta 8/8 (2 new tests); full suite shared 142, server 242 + 5 skip, web 223 + 4 skip, scripts 18/18; meetings.spec 2 passed (6.9m); demo.spec 1 passed (2.2m), diff empty.
Deviations:
- R1 (blocked acceptance): POST /meetings bookingId wiring in http/routes.ts (unknown booking 400, zone mismatch 400, agenda to processMeeting + createMeeting) + routes.test.ts case.
- R2: deps.ts builds the Postgres booking store under DATABASE_URL, in-memory otherwise.
- R3: MeetingContext.agenda typed + live-model prompt "Meeting agenda:" line (absent when no agenda; old prompts byte-identical) + meta.test.ts case.
- R4: processAcmeMeeting passes the Acme room's open booking id; mock processMeeting resolves the agenda from the mock bookings singleton (offline parity). demo.spec behavior unchanged (no booking exists there).
- world/index.ts 1-line rooms.js export approved (mirrors P6-A precedent).
- Narrow-screen invite pill moved to the left strip (top:148 left:16, measured clear) + scrollable form, to stop swallowing demo.spec clicks.
Files changed outside "Owns":
- packages/shared/src/world/index.ts (1-line export, approved).
- Lead wiring (own files, on the branch): http/routes.ts + routes.test.ts, deps.ts, llm/types.ts, llm/meta.ts + meta.test.ts, ui/actions.ts, api/mock.ts.
- docs/reports/P6-B.md (this report, by the lead; builder filed requests instead).
Requests:
- None open. R1-R4 done.
How to verify:
- pnpm typecheck; pnpm lint; pnpm test; pnpm test:e2e meetings.spec; pnpm test:e2e demo.spec (untouched).
- Maya books Acme room with Arjun + agenda; Arjun joins and walks in; Process meeting stores the agenda; busy until ended.
Open questions:
- None.
Next:
- P6-C notes, then P6-D (only if A and B merged and green by ~12:00 — met), then P6-E.
