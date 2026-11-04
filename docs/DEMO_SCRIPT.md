# DEMO_SCRIPT.md — the 3-minute demo video

A three-minute recording of the live site, https://meta-virtual-office.vercel.app,
in two browser windows: Maya (customer success lead) on the left, Arjun
(integration engineer) on the right. The narration is about 230 words at an easy
pace, which leaves room for the walking and clicking in each slot. The longer backup runbook (about 10 minutes, local stack) is
`docs/DEMO_VIDEO.md`; this script is the short cut for the submission.

## Before you record (off camera, about 5 minutes)

1. Reset the live demo: `fly apps restart meta-virtual-office`, then wait until
   `https://meta-virtual-office.fly.dev/health` answers (about 10 s). The go-live
   date is back to 15 Nov and nothing is approved yet. Do this before **every** take.
2. Two windows side by side, each about 960 × 1080 on a 1920 × 1080 screen:
   - left, a normal window: Maya;
   - right, a private (incognito) window: Arjun.
   The name is remembered per browser, so the private window keeps them apart.
3. Open the live URL in both. Pick **Join as Maya** on the left and **Join as
   Arjun** on the right. Wait until each shows the office and the other person
   in **People**. Then reload both, so the take starts from the loading screen.
4. Record the whole screen at 1080p, microphone on, notifications off.
5. Rehearse once. If a step misbehaves, stop, reset (step 1) and retake from
   the start: the meeting step needs the seeded records.

## The script

| Time | On screen | Say |
|---|---|---|
| **0:00–0:15** | Both windows show the loading screen ("Virtual Office", the progress bar), then the office fades in. | "Teams lose decisions between the meeting and the system of record. Virtual Office is a shared 3D office where the meeting itself updates the records, and every change leaves a receipt." |
| **0:15–0:35** | Click **Check in** in both windows. Each avatar walks to its own desk, sits and types. The top strip reads "Working · Take a break"; People shows both as Working. | "Two people, two browsers, one live office. Check in, and your avatar walks to your own desk. Your status is where you are, and everyone sees it." |
| **0:35–1:00** | Left: **Book a room** → Room: Acme room, Title: "Acme go-live sync", Agenda: "Review the Acme go-live checklist", tick Arjun → **Book**. Maya walks into the Acme room. Right: the invite "Maya invited you to Acme go-live sync in Acme room" → **Join**. Arjun walks in. Both strips read "In a meeting". | "Maya books the Acme room with an agenda and invites Arjun. He gets the invite live, joins, and walks in. Both of them are now in the meeting." |
| **1:00–1:15** | Left: click the TV on the Acme room's wall. The large view shows Acme Corp, the commitment "Go-live by 15 Nov" and "Go-live · 15 Nov". Press Esc. | "The wall screen shows what the records say right now: Acme's go-live is the fifteenth of November." |
| **1:15–1:45** | Left: **Process meeting**. Both drawers open **Approvals (4)**: the agenda, the meeting summary, and four cards: Move milestone date (2026-11-15 → 2026-11-22), Update commitment, Reassign task, New task. | "When the meeting ends, the office reads the transcript and proposes changes: move go-live to the twenty-second, update the commitment, reassign the webhook fix, and add a task to tell Acme. Nothing is written yet. The AI only proposes; a person decides." |
| **1:45–2:15** | Left: **Approve** the milestone, **Approve** the commitment, **Reject** the reassignment, **Approve** the new task. Right: in Arjun's drawer the receipt appears with no refresh: "Go-live 15 Nov → 22 Nov · Acme sync · Maya", "approved by Maya". Right: click the Acme TV; the same line is on the wall. Esc. | "Maya approves three changes and rejects one. On Arjun's screen the receipt arrives live: what changed, which meeting it came from, and who approved it. The wall screen shows it too." |
| **2:15–2:45** | Right: in **Ask the office**, type "What's the status of the Acme integration?" → **Ask**. The answer says go-live is now 22 November, with its sources listed. Then type "Who is Acme's CEO?" → **Ask** → "I don't have a record of that." | "Now anyone can ask the office. The status answer already reflects the approval, and it cites the records it used. And when nothing is on file, it says so instead of guessing." |
| **2:45–3:00** | Left: **Back to work**; Maya walks back to her desk. Hold on the whole office for two seconds. | "Meetings that update the records, receipts for every change, and an office that answers with its sources. That's Virtual Office: meta-virtual-office.vercel.app." |

## Notes for the edit

- One continuous take is best; if you cut, cut between the table rows.
- On a small screen, zoom the browser to 90% so the drawer and the Ask bar fit.
- Keep the cursor still while speaking over the receipt (1:45–2:15): it is the
  moment the video exists for.
- After recording, reset once more (`fly apps restart meta-virtual-office`) so
  the judges find the seeded office.
