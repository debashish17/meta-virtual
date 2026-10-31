# PROJECT_BRIEF.md — Virtual Office

## 1. One-liner

Ask your office what's happening: your tasks today, where every project stands, and what's going on with every customer.

## 2. Problem

Work status is scattered. Tasks live in a tracker, customer history in a CRM, decisions in meeting notes nobody reopens. Answering "where are we on this?" costs a ping, a call or a meeting. Customer promises made on calls rarely reach the project plan.

## 3. Solution

A real-time isometric 3D office that is also the interface to one shared memory for operations and customer relations.

- Meetings produce a summary, decisions, tasks and customer commitments.
- The AI proposes changes to records; a person approves each one.
- Anyone can ask the office a status question and receive an answer that cites its sources, or an explicit "no record" when nothing supports an answer.
- Inclusion is a built-in benefit (captions, translated summaries and async catch-up later), not the headline.

## 4. MVP goal: "visual + memory"

A beautiful reference-matched office with two-user multiplayer, plus one complete AI-memory workflow that changes what another user sees.

## 5. Demo scenario (frozen)

Fictional company: **Northwind Software**, a small B2B team managing customer integrations.
Customer: **Acme Corp**. Project: **Acme Payments Integration**.

Seeded state before the demo:
- Account: Acme Corp (deal stage: Implementation).
- Project: Acme Payments Integration, milestone "Go-live" targeted 15 Nov 2026.
- Commitment: "Go-live by 15 Nov" made to Acme.
- Tasks: "Fix webhook signature validation" (blocked), "Write integration test suite" (in progress), "Prepare Acme onboarding guide" (todo).
- Users: Maya (customer success lead) and Arjun (integration engineer).

Scripted meeting transcript (fixture): the team agrees that webhook validation depends on a vendor fix, the go-live moves to 22 Nov, Arjun takes over the blocked task, and Maya will tell Acme.

Demo script:
1. Maya and Arjun join from two browsers and see each other's avatars and name labels.
2. Maya walks into the Acme customer room; the wall display shows the current status.
3. Maya runs the meeting through the pipeline. The approval drawer shows proposed changes: milestone date 15 Nov to 22 Nov, commitment updated, task reassigned to Arjun, new task "Notify Acme of new date".
4. Maya approves some and rejects one, so the drawer is shown to be a real control.
5. Arjun's view updates live, without a refresh.
6. Arjun asks "What's the status of the Acme integration?" and gets an answer reflecting the approved changes, with links to the source meeting and records.
7. Arjun asks something unsupported ("Who is Acme's CEO?") and the office says it has no record.

## 6. In scope (must work)

| Area | Requirement |
|---|---|
| 3D office | Reference-matched scene: glass rooms, kitchenette, desk clusters, window wall, lighting, fixed isometric camera |
| Movement | Keyboard movement, collision, name labels, simple stylized avatars |
| Multiplayer | Two browsers in one office, server-authoritative, smooth interpolation, reconnect |
| Social | Presence and text chat; zone detection for meeting and customer rooms |
| Meeting memory | Scripted transcript, then summary, decisions, tasks, commitments (validated) |
| CRM and operations slice | Seeded account, project, milestone, tasks, commitment, linked together |
| AI approvals | Proposed changes with before and after, approve and reject, audit trail |
| Ask the office | Status, ownership and "my day" answers with source links; abstains when no record |
| Real-time | Approved changes appear for other users without a refresh |
| Deployment | Public web app and reachable multiplayer server |
| Fallbacks | Demo works with no LLM key (fixture mode) and with no microphone |

## 7. Out of scope until the MVP passes

Voice (LiveKit), live transcription, semantic search with embeddings, GitHub integration, screen share, shared snippet pad, calendar and email sync, CSV import, performance or sentiment analysis of people, full CRM feature parity, mobile layout.

## 8. Non-goals (permanent)

- Replacing Salesforce or HubSpot feature for feature.
- Monitoring or scoring employees.
- Autonomous AI writes to records.
- A hosted IDE.

## 9. Success criteria

1. A side-by-side screenshot comparison with the reference passes the visual checklist in `DESIGN_SPEC.md`.
2. Two separate browsers complete the demo script end to end on the deployed app.
3. Unsupported questions return "no record", never a fabricated answer.
4. The demo still completes if the LLM API is unavailable (fixture mode).

## 10. Open decisions (owner to confirm)

- Customer scenario above is recommended, not yet confirmed.
- AI provider: not chosen. Use any one provider behind `LlmClient`; if the hackathon requires a specific model, use that one.
- Hosting: one web host and one persistent WebSocket host, to be chosen before the deployment milestone.

