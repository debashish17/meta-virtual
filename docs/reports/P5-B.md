# P5-B Call UI — checkpoint report

Work package / gate: P5-B Call UI
Status: partial
Done:
- Join/leave follow the avatar: entering a meeting/customer/project room zone
  (net-store zone) fetches `POST /calls/token` and connects a `livekit-client`
  Room; leaving disconnects. Room-to-room walks move the call; stale joins
  (leave before resolve) exit quietly.
- First join asks for the microphone explicitly; any mic failure (denial,
  missing device) joins listen-only with the notice "Microphone unavailable —
  you're listening only.", never blocked, never unavailable. Unmute retries.
- Call bar (Mute, Camera, Share, Leave) + camera tiles in the right drawer
  column, collapsible to a tab, never over the floor centre. In-call status is
  `in_meeting`; the pre-call status is restored on leave (a mid-call user
  change is never clobbered).
- Any token/connection failure (503 `calls_off`, 404, network, connect throw,
  unexpected drop) shows "Calls unavailable" and changes nothing else; leaving
  and re-entering retries; Dismiss and manual Leave suppress rejoin until then.
- `LiveShare.tsx`: the active screen share draws as a `VideoTexture` on the
  Acme/Project TV mesh (WallDisplays' geometry + 3 mm); click opens the larger
  DOM overlay. Selectors + overlay unit-tested.
- Token request/response parsed with the shared Zod schemas; the LiveKit SDK
  loads lazily (599 KB chunk, first real join only); no secrets logged or
  committed; idle renders nothing so the fixture/offline demo is untouched.
Evidence:
- `pnpm typecheck` 3/3, `pnpm lint` 3/3, `pnpm build` pass (post-rebase).
- `pnpm test`: web 133 passed + 4 skipped (40 new P5-B: zones 4, tokens 4,
  store 20, CallPanel 8, liveShare 4), shared 107, server 138 + 3 skipped.
  No existing test touched.
- `npx playwright test e2e/calls.spec.ts`: 3/3 green in 8.2 m on this box:
  T1 real no-creds path (token POST `{zoneId:"acme_room"}` observed on the
  wire, "Calls unavailable", no crash, status stays Available, walk-out
  clears); T2 mock-room flow (bar, tiles with video, camera/mute/share
  toggles, Leave + suppression, re-entry rejoin, walk-out auto-leave,
  "In a meeting" echo); T3 real CDP mic denial (permission state "denied",
  listen-only + notice, controls enabled, retry stays, Leave works).
- Lane exercise (WEB_PORT=5175, PORT=2569): screenshots
  /tmp/p5b/calls-unavailable.png and /tmp/p5b/calls-live.png show the notice
  bar and the live bar with You + Arjun tiles, right-docked, not central.
  (1440x810 capture hangs under SwiftShader; shots are 640x360.)
- Commits 151ea32..d85726a on wp/P5-B-call-ui, rebased on main 732acb9,
  never pushed.
Deviations:
- LiveShare is implemented and unit-tested but NOT mounted: the 2-line mount
  in OfficeScene.tsx is outside Owns (see Requests). Nothing else was a
  work-around: the call panel, store and mock room are fully wired.
- The panel portals to document.body with z-index 50: inside the panels root
  its z-index is trapped by fixed-position ancestors (probed paint order) and
  the dev name chip (z-40, same corner) ate the Share/Leave clicks — one Share
  click even opened the picker's "Pick a name" dialog mid-test. Transient
  overlap with the dev chip/look button during calls is accepted; the drawer
  can overlap at small widths — both panels collapse with one click.
- Calls survive Colyseus "reconnecting" (frozen snapshots, LiveKit room is
  independent) and end on hard "offline": dropping calls on a socket blip
  would be worse, and re-online resumes zone-following.
- Cancelling the share picker (NotAllowedError) is silent; only microphone
  failure maps to listen-only. Mic failure of ANY name maps there (real
  Chrome denies with NotAllowedError; headless shell reports NotSupportedError
  — probed — and a missing mic must not block either).
- e2e launches its own Chromium per test (same build as the fixture): the
  three tests need different media flags and launchOptions cannot scope
  per-describe. CDP mic denial needs the context's explicit browserContextId
  (without it the call succeeds but the state stays "prompt" — probed).
Files changed outside "Owns": none (Panels.tsx: the owned import + slot line).
Requests:
- R1 (lead, blocks the wall-display item): mount LiveShare — in
  apps/web/src/office/displays/../OfficeScene.tsx add the import and
  `<LiveShare />` next to `<WallDisplays />`. No other change needed; the
  component reads the calls store and renders null until a share is live.
- R2 (info, no action): P5-A's merge turns T1's 404 into 503 `calls_off`;
  the spec already accepts both, no spec change needed.
- R3 (owner, D9): a LiveKit Cloud project for the OPEN live-media items below.
How to verify:
- `git checkout wp/P5-B-call-ui && pnpm install && pnpm typecheck && pnpm lint
  && pnpm test && pnpm build`
- `npx playwright test e2e/calls.spec.ts` (~10 min on the SwiftShader box)
- `WEB_PORT=5175 PORT=2569 VITE_SERVER_URL=http://localhost:2569 pnpm dev`,
  open http://localhost:5175/?name=Maya, walk into the Acme room: the bar says
  "Calls unavailable". With a token stub + `__callsDebug.useMockRoom()` (DEV
  console) it joins live instead.
- Unit seam: `apps/web/src/calls/*.test.*` drive `MockRoom`; `liveRoom.ts`
  (real SDK) is types-only until the first real join.
Open questions:
- O1 (reviewer must confirm, not waive): the OPEN live-media items below need
  R1 + R2 + R3 and a real browser; frame rate during a call is unmeasured for
  the same reason (headless fps is not a GPU benchmark).
- O2 (lead): keep the transient call-panel/drawer overlap, or stack them?
Next: P5-C transcript from the call (needs P5-A + P5-B; the room seam and
`__callsDebug` peer/screen drivers are its natural test hooks). Not started.

## OPEN live-media items (need R1 + R2 + R3; steps to close)

1. Two browsers in the Acme room hear and see each other (G7): with LIVEKIT_*
   set, walk two browsers in; each must show the other's tile and play audio;
   one leaves and its tile disappears (WORK_PACKAGES P5-B e2e as written, with
   `--use-fake-ui-for-media-stream --use-fake-device-for-media-stream`).
2. A shared screen shows on the room's wall display: Share in the Acme room
   and confirm the TV texture + the click-to-enlarge overlay.
3. Microphone denied against the REAL room: deny mic, join, confirm
   listen-only (unit + mock coverage exists; the LiveKit getUserMedia path is
   what stays unverified).
4. Frame rate during a call, from a real (visible, GPU) browser.

## Reviewer addendum (2026-11-02, independent re-verification)

Reviewer read every owned implementation and test body (not search output),
re-ran all checks fresh (`--force`, no turbo cache), and re-ran the package e2e.

Checks re-run (all from the worktree root, branch wp/P5-B-call-ui):
- `pnpm typecheck --force`: 3/3 pass, 0 cached.
- `pnpm lint --force`: 3/3 pass, 0 cached.
- `pnpm test --force`: shared 107, web 135 passed + 4 skipped (133 + 2 new
  reviewer tests), server 138 + 3 skipped. No failures.
- `pnpm build --force`: pass; `livekit-client` stays a lazy 599 KB chunk.
- `npx playwright test e2e/calls.spec.ts`: 3/3 green in 7.0 m (T1 1.2 m,
  T2 3.7 m, T3 1.9 m), ports 5190/2590 free afterwards.

Verdict per acceptance item (WORK_PACKAGES.md P5-B):
1. Join/leave follow the avatar; first join asks for the mic; denial joins
   listen-only with a notice, never blocked: PASS for the verifiable path
   (22 store tests + e2e T2 mock flow + e2e T3 real CDP mic denial on the
   mock's real getUserMedia path). The LiveKit `setMicrophoneEnabled` denial
   path itself is honestly OPEN (needs R3); the open item is real and minimal.
2. Call bar (mute, camera, share, leave) + camera tiles, right drawer column,
   collapsible, never over the centre; status `in_meeting` in call: PASS
   (8 CallPanel tests + e2e T2; CSS is fixed bottom-right 320 px, drawer
   tokens per DESIGN_SPEC 9). One real bug found and fixed, see below.
3. Shared screen on the wall display (`VideoTexture`, click opens overlay):
   PARTIAL — implementation + overlay tests are correct and the TV geometry
   matches WallDisplays exactly (x 13.7/27.5, z 0.215 + 3 mm), but the mount
   is not in OfficeScene (verified: only LiveShare.tsx references it), so R1
   is confirmed real; the live path also needs R3. Honestly OPEN.
4. LiveKit unreachable -> "Calls unavailable", nothing else changes: PASS
   (store unavailable tests + e2e T1 on the real no-creds path: the token
   POST goes on the wire, 404 today / 503 `calls_off` after P5-A, status
   stays Available, walk-out clears).
5. e2e two contexts see each other's tiles; one leaves, its tile disappears:
   OPEN as written (needs P5-A merge + R3 LiveKit Cloud). The T1/T2/T3
   substitution covers everything headless can prove; confirmed minimal.
Acceptance G7 "two browsers hear and see each other": OPEN (needs R3).
"Microphone denied gives listen-only": PASS via mock + CDP; real-room path
OPEN (needs R3). "Frame rate during a call from a real browser": OPEN
(headless SwiftShader fps is not a benchmark; needs R3 + visible browser).

No-creds fixture demo: PASS — idle renders null (CallPanel returns null, the
watcher stays idle offline), no `LIVEKIT_*` in web code (ARCHITECTURE 12.9:
the browser gets the URL with the token), the SDK loads on first real join
only, and e2e T1 proves walk-in/out with no service leaves the office
unchanged.
No existing test changed/weakened: PASS — `git diff 732acb9..HEAD
--name-status` shows every test file as Added; the single Modified file is
the owned 2-line Panels.tsx slot (import + `<CallPanel />`).
No secrets committed: PASS — grep over owned files for keys/secrets/tokens
and console logging is clean; the token is returned, never logged.
Only Owns paths changed: PASS — `apps/web/src/calls/**` (13 files),
`apps/web/src/office/displays/LiveShare.tsx`, the Panels.tsx slot line,
`e2e/calls.spec.ts`, `docs/reports/P5-B.md`, plus the reviewer fix below
(owned files only). Tree clean otherwise; nothing pushed; no merge.

Fix applied by the reviewer (owned files only):
- Room-to-room walks stranded the status on "In a meeting": `cancelCall`
  restored the pre-call status and `joinCall` immediately recaptured the
  snapshot, which still shows `in_meeting` until the server echo arrives
  (the unit suite's synchronous echo masked this). `store.ts` now carries
  the pre-call status across a room-to-room transition (`cancelCall(restore)`
  + guarded capture in `joinCall`) and `failJoin` restores via
  `restorePreviousStatus()`. Two regression tests added to `store.test.tsx`
  (lagging-echo carry-over; second-join-fails restore). The lag test was
  proven to fail on the pre-fix code (`in_meeting, away, in_meeting,
  in_meeting`) and pass after (`in_meeting, in_meeting, away`).
- No other fix was needed; R1/R2/R3 and O1/O2 stand as written.
