# DEMO_SCRIPT.md — the 3-minute demo video

**What the judges must remember:** the meeting itself updates the records; AI only
proposes and a person decides; every change leaves a receipt that everyone sees
live; and the office answers with its sources, or says it doesn't know.

**Cast:** Maya, customer success lead (left window) and Arjun, integration engineer
(right window), on the live site https://meta-virtual-office.vercel.app.
**Length:** exactly 3:00, about 280 words of narration at a calm pace (never more than
2.5 words a second in any row).

---

## Before you record

1. **Reset the live demo:** `fly apps restart meta-virtual-office`, then wait until
   https://meta-virtual-office.fly.dev/health answers (about 10 s). Go-live is back
   to 15 Nov and nothing is approved. Do this before **every** take.
2. **Two windows side by side** on a 1920 × 1080 screen, each half the screen:
   Maya in a normal window (left), Arjun in a private window (right). Browser zoom
   90% in both, bookmarks bar hidden.
3. **Join before you press record:** open the live URL in both, pick **Join as Maya**
   (left) and **Join as Arjun** (right), and wait until each sees the other under
   **People**. The take starts inside the office, so the loading screen and the
   name card stay out of the video.
4. **Have the text ready to paste:** *Acme go-live sync*, *Review the Acme go-live
   checklist*, *What's the status of the Acme integration?*, *Who is Acme's CEO?*
5. **Opening shot:** the whole-floor picture, `docs/screenshots/office-m2-overview.png`,
   as a still with a slow zoom in the edit.
6. Recording: 1080p, microphone on, notifications off. Rehearse once, then reset
   (step 1) and rejoin (step 3) for the real take.

---

## The script, second by second

**Window:** L = Maya (left), R = Arjun (right), Both = both windows on screen.
Times are for the finished video; where the product takes longer (walking, the
live model answering), speed it up or trim it in the edit to hit the time.

| Time | Window | Show | Say | Caption |
|---|---|---|---|---|
| **Scene 1 — The problem** |||||
| 0:00–0:05 | Still | The whole office floor, slow zoom in. | "Teams make their decisions in meetings," | *Commonplace — the office that remembers* |
| 0:05–0:10 | Still | Zoom continues toward the Acme room. | "and then someone has to update the records. Usually, nobody does." | |
| 0:10–0:15 | Still → Both | Cross-fade to the two windows. | "Commonplace is a shared office where the meeting updates the records itself." | |
| **Scene 2 — Two people, one office** |||||
| 0:15–0:20 | Both | L: click **Check in**. R: click **Check in**. | "This is Maya from customer success, and Arjun from integrations:" | *Live multiplayer, two browsers* |
| 0:20–0:28 | Both | Both avatars stand, walk to their own desks, sit and type (2× in the edit). | "two browsers, one live office. When they check in, they walk to their own desks." | |
| 0:28–0:35 | L | Cursor on the top strip, *Working · Take a break*, then on **People**: both *Working*. | "Status here isn't a dropdown. It's where you are, and everyone sees it." | |
| **Scene 3 — Booking the meeting** |||||
| 0:35–0:43 | L | **Book a room** → Room *Acme room*, paste Title and Agenda, tick *Arjun* → **Book**. | "Acme's go-live is at risk, so Maya books the Acme room with an agenda" | |
| 0:43–0:48 | Both | L: Maya walks to the room (2×). R: the invite appears under the top strip. | "and invites Arjun. The invite reaches him instantly." | |
| 0:48–0:55 | R | Click **Join**; Arjun walks into the Acme room (2×). | "He joins, and walks in." | |
| 0:55–1:00 | Both | Cursor on both strips: *In a meeting · Back to work*. | "Both of them are now in the meeting." | |
| **Scene 4 — The record before** |||||
| 1:00–1:04 | L | Click the TV on the Acme room's back wall; the large view opens. | "The wall screen shows the records as they stand:" | |
| 1:04–1:10 | L | Hold on *Go-live · 15 Nov*, then press Esc. | "go-live on the fifteenth of November." | |
| **Scene 5 — AI proposes** |||||
| 1:10–1:14 | Both | L: click **Process meeting**. Both drawers open **Approvals (4)**. | "When the meeting ends, the office reads the transcript" | |
| 1:14–1:22 | L | Cursor down the first two cards: *Move milestone date* 2026-11-15 → 2026-11-22, *Update commitment*. | "and proposes four changes: move go-live to the twenty-second, update the promise to Acme," | |
| 1:22–1:30 | L | Cursor on *Reassign task* (Maya → Arjun) and *New task* (*Notify Acme of new date*). | "hand the blocked webhook fix to Arjun, and add a task to tell Acme." | |
| 1:30–1:40 | R | Arjun's drawer shows the same **Approvals (4)**. Pause. | "Nothing has changed yet. The AI proposes; people decide." | *AI proposes. People decide.* |
| **Scene 6 — The receipt** |||||
| 1:40–1:44 | L | Click **Approve** on *Move milestone date*. | "Maya approves the new date," | |
| 1:44–1:54 | R | Hold still: the receipt appears with no refresh, *Go-live 15 Nov → 22 Nov · Acme sync · Maya*, *approved by Maya*. | "and on Arjun's screen the receipt arrives live: what changed, which meeting it came from, and who signed it off." | *Every change has a receipt* |
| 1:54–2:02 | L | **Approve** the commitment, **Reject** the reassignment, **Approve** the new task. | "She rejects the reassignment, so the webhook fix stays with her, and approves the rest." | |
| 2:02–2:15 | R | Click the Acme TV: the same receipt is on the wall. Hold, then Esc. | "The wall screen agrees: the whole office now says the twenty-second." | |
| **Scene 7 — Ask the office** |||||
| 2:15–2:20 | R | In **Ask the office**, paste *What's the status of the Acme integration?* → **Ask**. | "Anyone can ask the office." | |
| 2:20–2:32 | R | The answer appears (trim the wait): point at *22 November*, then at the sources under it. | "The answer already knows about Maya's approval, and it shows the records it used." | *Answers cite their sources* |
| 2:32–2:36 | R | Paste *Who is Acme's CEO?* → **Ask**. | "Ask about something that isn't on file," | |
| 2:36–2:45 | R | *I don't have a record of that.* appears. Hold. | "and it tells you so, instead of guessing." | |
| **Scene 8 — Close** |||||
| 2:45–2:51 | L | Click **Back to work**; Maya walks back to her desk. | "Meetings that write the records, a person in the loop," | |
| 2:51–2:55 | L | Scroll the mouse wheel to zoom out over the floor. | "a receipt for every change, and answers you can check." | |
| 2:55–3:00 | End card | *Commonplace · meta-virtual-office.vercel.app · open it in two windows* | "That's Commonplace. Try it at meta-virtual-office dot vercel dot app." | |

---

## If something goes wrong

- Anything unexpected on screen: stop, reset (`fly apps restart meta-virtual-office`),
  rejoin both windows, and retake from 0:15. The meeting always proposes the same
  four changes, so every take matches this script.
- The Ask answer (2:20) is written by a live model, so its wording varies and it
  takes about 10 s; it always names 22 November and lists its sources after the
  approval. Don't read it out; point at it, and trim the wait in the edit.
- After the final take, reset once more so the judges find the seeded office.
