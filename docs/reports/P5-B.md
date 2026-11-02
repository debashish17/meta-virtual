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
