# DEMO_VIDEO.md — Recording the backup demo video (P4-B)

If the live demo fails during the presentation, play this video instead. It
runs the frozen demo script (`docs/PROJECT_BRIEF.md` section 5) on the local
stack with the fixture AI, in two browsers, and takes about 7 minutes. Record
it on a machine with a real GPU — the office needs one for a watchable frame
rate (on a GPU-less box the scene renders at about 1 fps; see the P4-B report).

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
- Recording: capture both windows (or one window and cut between them in
  editing). 1080p, system audio off, microphone on for the narration below.
  Mute desktop notifications.

If anything in the scenes below goes wrong, do not improvise: stop, run
`pnpm demo:reset`, restart the server with the command it prints, reload both
browsers, and re-record from the start of the scene. Every scene starts from
the seeded state, so scenes can be recorded out of order and edited together.

## 1. Join (0:00–1:00)

- Say: "This is the Northwind Software office. Maya, the customer success
  lead, is on the left; Arjun, the integration engineer, on the right."
- In each window, walk a few steps (WASD or arrow keys; Shift jogs) so the
  viewer sees the other avatar move with its name label.
- Say: "Two browsers, one office, live."

## 2. The Acme room and its wall display (1:00–2:30)

- In Maya's window, click the floor to walk into the Acme customer room (the
  glass room; the zone pill names it and a "Process meeting" button appears
  once she is inside).
- Click the room's wall display. The overlay shows the seeded status; read it:
  "Acme Corp, Implementation. Go-live by 15 Nov. The webhook task is blocked."
- Press Escape to close the overlay.
- Say: "This is what the office believes right now. Then the team meets."

## 3. Process the meeting (2:30–4:00)

- Click "Process meeting" (Maya's window). The right drawer becomes the
  approval drawer: "Approvals (4)" with the meeting summary.
- Read the summary: the go-live moves to 22 Nov, Arjun takes the blocked
  task, Maya tells Acme.
- Scroll the four change cards slowly so each before/after is readable:
  milestone date 15 Nov → 22 Nov, the commitment updated, the task reassigned
  to Arjun, the new task "Notify Acme of new date".
- Say: "The AI proposes; nothing is written yet. A person approves each one."

## 4. Approve three, reject one (4:00–5:00)

- Click "Approve" on three cards and "Reject" on the fourth (any one; the
  e2e demo rejects the last). The drawer empties back to "My day".
- Say: "Three approved, one rejected — the drawer is a real control, and the
  rejection changed nothing."

## 5. Arjun's view updates live (5:00–5:30)

- Cut to Arjun's window without reloading it. His drawer, wall display and
  My day already show the 22 Nov date and the reassigned task.
- Say: "Arjun never refreshed. Approval pushed the change to everyone."

## 6. Ask the office (5:30–6:30)

- In Arjun's window, click the "Ask the office…" box at the bottom centre and
  ask: "What's the status of the Acme integration?"
- Read the answer and point at the source links (the meeting and the records).
- Say: "Every claim cites its record."
- Ask: "Who is Acme's CEO?"
- Read the answer: "I don't have a record of that."
- Say: "And when nothing supports an answer, it says so instead of guessing."

## 7. Close (6:30–7:00)

- Say: "That is the demo: a meeting updated the records, everyone saw it
  live, and the office answers from those records — with sources, or not at
  all."
- Stop recording. Keep the raw capture until the presentation is over.

## Fallback if the live stack fails during recording

1. **One step misbehaves** (a click missed, a panel is slow): re-record that
   scene only, after `pnpm demo:reset` + server restart + reload both
   browsers. Do not continue from a half-approved state.
2. **The server wedges** (reconnecting pill that never clears, API errors):
   stop `pnpm dev`, `pnpm demo:reset`, start `pnpm dev` again, reload both
   browsers. Check `http://localhost:2567/health` answers first.
3. **A browser wedges** (black canvas, frozen tab): reload that tab; if it
   persists, close it and open a fresh window at the same `?name=` URL.
4. **Nothing multiplayer works** (last resort): record scenes 2–4 and 6 in ONE
   browser with the mock API (`pnpm dev` without `VITE_API`; the "Demo data"
   notice shows). The meeting, approvals and both questions work identically
   against the in-memory demo data; skip scene 5 (live propagation) and say
   so on camera. Do not present this cut as the multiplayer demo without
   saying it is the single-player fallback.

## Fallback if the live demo fails during the presentation

Play this video. Say: "The live office is being uncooperative, so here is
the same script recorded earlier" — then play scenes 1–7 straight through.
