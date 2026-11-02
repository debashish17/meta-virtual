# P5-C Transcript from the call

```
Work package / gate: P5-C Transcript from the call
Status: partial
Done:
- Server `apps/server/src/calls/transcript.ts`: `registerCaptionHandlers(room)` parses
  `caption_send` with the shared `CaptionSend` schema, broadcasts the parsed `caption`
  to the speaker's zone scope (the open floor shares one scope), appends final
  segments with the speaker's name to a per-room `TranscriptBuffer`, and rate-limits
  at 30/s per connection (interim hypotheses are frequent). Invalid payloads get
  `invalid_message`, floods `rate_limited`; unknown senders are ignored.
- Web `apps/web/src/calls/captions/**`: Web Speech API recognizer (continuous,
  interim, auto-restart on engine pauses, never after stop/denial, speech never
  logged), `caption_send` sender, caption store + `bindCaptionRoom`, `endMeeting` /
  `postTranscriptAsMeeting` / `postPastedTranscript` (all POST the transcript with
  the zone through `MeetingCreateTranscript`, parse with `MeetingProcessResult`,
  empty answers `no speech was captured` with no meeting), and `TranscriptPanel`
  (live captions, End meeting, paste box). 23 committed unit/component tests.
- `e2e/live-meeting.spec.ts`: (1) a captured transcript posted through the
  package's own module yields 4 proposed changes and the drawer shows
  `Approvals (8)`; the empty post answers the exact notice and creates nothing.
  (2) caption arrival between two raw room clients: asserts for real once R1
  lands, skips with the R1 reason until then (never fails silently).
- G7 transcript-to-changes through the same pipeline is proven on the
  seeded/pasted path (FixtureLlm extracts only the exact fixture text, so the e2e
  reads that text back from a fixture meeting and re-posts it as the capture).
Evidence:
- `pnpm typecheck`: pass 3/3. `pnpm lint`: pass 3/3. `pnpm build`: pass.
- `pnpm test`: shared 107, web 116 passed + 4 skipped (23 new caption tests),
  server 138 passed + 3 skipped (baseline: the temp harness below is deleted).
- Temp server harness (real OfficeRoom + R1's exact one-line composition, real SDK
  clients): 7/7 green — zone broadcast + own-echo, zone scoping via a real walk,
  assembly/take-once, invalid + rate-limit, unknown-sender, format + cap.
  Log: /tmp/p5c-harness.log. Source kept for R4: /tmp/p5c-transcript.test.ts.snapshot
  (restore-verified 7/7 after deletion).
- `npx playwright test e2e/live-meeting.spec.ts`: 1 passed (40 s), 1 skipped with
  the R1 reason (probe + bounded leave, ~18 s); total 58 s.
- Lane exercise (WEB_PORT=5176, PORT=2570): /health ok + fixture llm, captions
  module serves 200, curl fixture (4 changes) -> transcript repost (4 changes) ->
  8 pending. Log: /tmp/p5c-lane.log. All processes stopped, ports verified free.
- Fixture/static demo untouched: `git status` shows only new files under Owns, no
  modification to any existing file; the panel is exported but unmounted and the
  room handler unregistered, so every live path is inert without R1-R3.
Deviations:
- D1: the server never POSTs on last-participant-leaving. "End meeting" (call bar,
  panel, or P5-B's disconnect-when-alone path via R3) posts from the client, which
  already has auth and the api; a server POST would need service auth and meeting
  ownership the room does not have. Same pipeline either way; `buffers.take(zone)`
  is the API the lead's `onLeave` hook would use if a server post is wanted later.
- D2: the e2e arrival test skips pre-R1 with an explicit reason instead of failing.
  The transport logic it would cover is proven by the 7/7 harness; the test body
  needs no change after R1 (it asserts for real when captions arrive).
- D3: the server tests live in /tmp, not committed: P5-C owns only
  `transcript.ts` on the server, so `transcript.test.ts` is request R4.
Files changed outside "Owns": none.
Requests:
- R1 (lead, `apps/server/src/room/office.room.ts` — 3 lines): import
  `{ registerCaptionHandlers, TranscriptBuffer }` from `../calls/transcript.js`,
  add `private captions = new TranscriptBuffer();`, call
  `this.captions = registerCaptionHandlers(this, this.captions);` at the end of
  `onCreate`. Unblocks live caption arrival; the e2e arrival test then asserts.
- R2 (lead/P5-B, `apps/web/src/net/connection.ts`): on attach,
  `bindCaptionRoom(newRoom)` from `../calls/captions/index.js`; add
  `caption(text, final)` to `netSend` via `sendCaption`; P5-B's call join/leave
  starts/stops `createCaptionRecognizer` forwarding to that sender.
- R3 (lead/P5-B): mount `<TranscriptPanel zoneId={zone.id} zoneName={zone.name} />`
  beside the call bar (it is exported but no slot file is owned here); route the
  call bar's End-meeting button and the last-participant-leaving disconnect
  through `endMeeting` with `finalSegments()`.
- R4 (lead): keep `apps/server/src/calls/transcript.test.ts` from
  /tmp/p5c-transcript.test.ts.snapshot (7/7, restore-verified).
How to verify:
- `pnpm typecheck && pnpm lint && pnpm test && pnpm build` from the worktree root.
- `npx playwright test e2e/live-meeting.spec.ts` (expect 1 passed, 1 R1-skipped).
- Lane: `WEB_PORT=5176 PORT=2570 VITE_SERVER_URL=http://localhost:2570 pnpm dev`,
  then `curl http://localhost:2570/health` and
  `curl http://localhost:5176/src/calls/captions/endMeeting.ts` (200).
Open questions:
- O1 (owner rehearsal, P5-D): real speech-to-text quality in the owner's Chrome
  (continuous Web Speech API) — written and mock-tested here, never run against a
  real microphone on this box — and the mic-denied listen-only path with a live
  call. If the browser route is not good enough, the owner decides on the LiveKit
  agent upgrade (IMPLEMENTATION_PLAN.md section 7).
- O2: P5-A merge + LiveKit Cloud project (P5-B's R3) still gate any two-browser
  media or wall-display live path; this package needs neither.
Next: P5-D live-meeting rehearsal once R1-R3 land and P5-A/B merge; the paste route
stays as the static-demo fallback regardless.
```
