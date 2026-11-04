# DEMO_VIDEO.md — Recording the backup demo video (P4-B, office-life story added in P6-E)

If the live demo fails during the presentation, play this video instead. It
runs the office-life story (check in, book the room, join) and then the frozen
demo script (`docs/PROJECT_BRIEF.md` section 5) on the local stack with the
fixture AI, in two browsers, and takes about 10 minutes. Record it on a
machine with a real GPU — the office needs one for a watchable frame rate (on
a GPU-less box the scene renders at about 1 fps; see the P4-B report).

## 0. Prerequisites (off camera, ~10 min once)

- The repo at `main`, dependencies installed (`pnpm install`), Docker running.
- Local Supabase running and seeded: `pnpm db:start`, then
  `pnpm demo:reset` (it prints a server-restart command; nothing is running
  yet, so just continue).
- Two browser windows side by side (or two profiles/monitors): they are Maya
  (left) and Arjun (right). Use a desktop viewport around 1440 x 810.
- Start the stack (leave the terminal visible for the first seconds of the
  recording, then hide it):
  - `pnpm dev` (web `http://localhost:5173/`, server `:2567`),
  - with the http API: `VITE_API=http pnpm dev` (the panels then read the
    server; the "Fixture AI" notice shows because no LLM key is set).
- Open Maya's window at `http://localhost:5173/?name=Maya` and Arjun's at
  `http://localhost:5173/?name=Arjun`. The `?name=` skips the name picker.
  Wait until both show the office and the other person's name pill.
  (On the deployed URL there is no `?name=`: the story starts at the "Who are
  you?" card, where each browser picks Join as Maya / Join as Arjun.)
- Recording: capture both windows (or one window and cut between them in
  editing). 1080p, system audio off, microphone on for the narration below.
  Mute desktop notifications.

If anything in the scenes below goes wrong, do not improvise: stop, run
`pnpm demo:reset`, restart the server with the command it prints, reload both
browsers, and re-record from the start of the scene. Every scene starts from
the seeded state, so scenes can be recorded out of order and edited together.

## 1. Join and check in (0:00–2:00)

- Say: "This is the Northwind Software office. Maya, the customer success
  lead, is on the left; Arjun, the integration engineer, on the right."
- In each window, click "Check in" (the bar at the top). Both avatars walk to
  their own desks — Maya's in Customer success, Arjun's in Integrations —
  sit down and start typing. The participants list shows them as Working.
- Say: "Check in walks you to your own desk. Two browsers, one office, live."

## 2. Book the room (2:00–3:30)

- In Maya's window, click "Book a room": room Acme room, title "Acme go-live
  sync", agenda "Review the Acme go-live checklist", invite Arjun, then Book.
  Maya stands up and walks to the Acme room on her own.
- Say: "Maya books the Acme room with an agenda — and walks over."
- Cut to Arjun's window: the invite reads "Maya invited you to Acme go-live
  sync in Acme room". Click Join. He stands up and walks into the room.
- Say: "Arjun gets the invite, joins, and walks in. The room shows busy to
  everyone else until they end the meeting."

## 3. The Acme room and its wall display (3:30–4:30)

- In Maya's window, the zone pill names the Acme room and a "Process meeting"
  button appears now that she is inside.
- Click the room's wall display. The overlay shows the seeded status; read it:
  "Acme Corp, Implementation. Go-live by 15 Nov. The webhook task is blocked."
- Press Escape to close the overlay.
- Say: "This is what the office believes right now. Then the team meets."

## 4. Process the meeting (4:30–6:00)

- Click "Process meeting" (Maya's window). The right drawer becomes the
  approval drawer: "Approvals (4)" with the meeting summary.
- Point at the agenda above the summary: it travelled with the booking.
- Read the summary: the go-live moves to 22 Nov, Arjun takes the blocked
  task, Maya tells Acme.
- Scroll the four change cards slowly so each before/after is readable:
  milestone date 15 Nov → 22 Nov, the commitment updated, the task reassigned
  to Arjun, the new task "Notify Acme of new date".
- Say: "The AI proposes; nothing is written yet. A person approves each one."

## 5. Approve three, reject one (6:00–7:00)

- Click "Approve" on the milestone, the commitment and the new task, and
  "Reject" on the reassignment. The drawer empties back to "My day".
- Say: "Three approved, one rejected — the drawer is a real control, and the
  rejection changed nothing."

## 6. Arjun's view updates live (7:00–7:45)

- Cut to Arjun's window without reloading it. His drawer kept a "Decided"
  history with the receipt line "Go-live 15 Nov → 22 Nov · Acme sync · Maya,
  approved by Maya".
- Click the Acme wall display in his window: under "Latest receipts" the same
  line is there — the hero moment. The rejected change shows in history but
  never as a receipt.
- Say: "Arjun never refreshed. The approval pushed a signed receipt — what
  changed, from which meeting, decided by whom — to his wall and his drawer."

## 7. Ask the office (7:45–8:45)

- In Arjun's window, click the "Ask the office…" box at the bottom centre and
  ask: "What's the status of the Acme integration?"
- Read the answer and point at the source links (the meeting and the records).
- Say: "Every claim cites its record."
- Ask: "Who is Acme's CEO?"
- Read the answer: "I don't have a record of that."
- Say: "And when nothing supports an answer, it says so instead of guessing."

## 8. Close (8:45–9:15)

- Say: "That is the demo: the team checked in, met, and the meeting updated
  the records — everyone saw the receipts live, and the office answers from
  those records, with sources, or not at all."
- Stop recording. Keep the raw capture until the presentation is over.

## Owner steps (not recorded here; no deploy happens in the P6-E session)

1. **Deployed-URL run (owner, with P4-A):** run this same story on the public
   URL after the final redeploy — the "Who are you?" card, check in, book,
   join, process, approve, the live wall receipt — and confirm each scene.
   **Reset before every run there:** the deployed server (fast mode) keeps the
   records in memory, and `pnpm demo:reset` only touches a database. Restart
   the server with `fly apps restart meta-virtual-office`, wait for
   `https://meta-virtual-office.fly.dev/health`, then reload both browsers. A
   second run without the restart starts at go-live 22 Nov, so the wall shows
   "Go-live 22 Nov → 22 Nov" instead of the 15 Nov → 22 Nov receipt.
2. **Two-real-browsers manual pass (owner):** two people (or two devices) walk
   the story by hand on the deployed URL, including one reconnect (reload a
   tab mid-story: one avatar, state restored).

## Fallback if the live stack fails during recording

1. **One step misbehaves** (a click missed, a panel is slow): re-record that
   scene only, after `pnpm demo:reset` + server restart + reload both
   browsers. Do not continue from a half-approved state.
2. **The server wedges** (reconnecting pill that never clears, API errors):
   stop `pnpm dev`, `pnpm demo:reset`, start `pnpm dev` again, reload both
   browsers. Check `http://localhost:2567/health` answers first.
3. **A browser wedges** (black canvas, frozen tab): reload that tab; if it
   persists, close it and open a fresh window at the same `?name=` URL.
4. **Nothing multiplayer works** (last resort): record scenes 3–4 and 7 in ONE
   browser with the mock API (`pnpm dev` without `VITE_API`; the "Demo data"
   notice shows). The meeting, approvals and both questions work identically
   against the in-memory demo data; skip scenes 1–2 and 6 (check-in, booking,
   live propagation) and say so on camera. Do not present this cut as the
   multiplayer demo without saying it is the single-player fallback.

## Fallback if the live demo fails during the presentation

Play this video. Say: "The live office is being uncooperative, so here is
the same script recorded earlier" — then play scenes 1–8 straight through.
