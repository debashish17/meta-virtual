# IMPLEMENTATION_PLAN.md

The plan from where the project stands (end of M2) to the deployed demo (M6). The milestones and
their gates keep the meaning they always had; the work inside M3 to M6 is now cut into **phases** of
**work packages** that several agents can build at once.

- `docs/WORK_PACKAGES.md`: what each package builds, the files it owns, its tests and acceptance.
- `docs/HANDOFF.md`: how a team of agents runs this plan, and how the final review is done.

At every gate: stop, send the checkpoint report (`AGENTS.md` section 8), and wait for the owner
before the next phase.

---

## 1. Where the project stands (2026-11-01, `main`)

| Milestone | State |
|---|---|
| M0 Bootstrap | Done. G0 passed. |
| M1 Static office | Done. G1 approved by the owner, then reworked at the owner's request (64 x 40 m street layout, GLB kit, textures, city): see `DESIGN_SPEC.md`. |
| M2 Avatar and movement | Built. Collision, `findPath` and zones are tested; click-to-move, zone pill, look editor. **G2 waits for the owner's sign-off (decision D1).** |
| Beyond M2 (owner requests) | Mixamo people with recoloured clothes; colleagues on daily routines; sitting down and standing up (Stand To Sit / Sit To Stand), typing with hands kept on the desk, the tea counter; the asset pipeline and its review sheet. |
| M3 to M6 | Not started. The server is still the M0 hello room. No client networking, database, LLM or product UI yet. |

The original M0 to M2 task lists are in git history: this file as of the repository's first commit (`git log --reverse --format=%h | head -1`).

## 2. Principles for M3 to M6

1. **The scene is visually frozen** (decision D2). No new 3D, asset or lighting work. The only
   scene work allowed is:
   - remote people and shared colleagues;
   - wall displays;
   - fixes for regressions.

   The product (the memory loop) has not started and is what the demo is judged on.
2. **Contracts first.** Phase 1 puts every message, record, API body and the movement simulation
   in `packages/shared`, tested. Lanes build against those contracts, not against each other.
3. **Each package owns its files.** Packages in the same phase never edit the same file, so they
   can run in parallel and merge without conflicts. Shared entry files get their changes in
   Phase 1 as empty, already-mounted slots.
4. **Fixture first.** Everything works with `FixtureLlm`, the in-memory repo and the mock API before
   the real provider, the database and the HTTP API are wired in.
5. **Offline mode stays.** With no server, the office runs single-player as it does today.
6. **Tests first** for movement, validation, extraction, approval and ask.
7. **Shared designs are written down, once.** `ARCHITECTURE.md` section 12 settles movement sync
   and reconciliation, the room registry, auth modes, database access under RLS, the LLM adapter,
   the web data layer and deployment. A lane that needs to depart from it files a request to the
   lead; it does not improvise.

## 3. Phases

| Phase | Packages (agents in parallel) | Gates it closes |
|---|---|---|
| 1 Foundations | P1-A contracts and shared simulation (splittable into P1-A1 ‖ P1-A2), then P1-C app skeletons (lead) ‖ P1-B tooling | Gate P1 |
| 2 Parallel lanes | P2-A room server ‖ P2-B web networking ‖ P2-C database ‖ P2-D LLM and meetings ‖ P2-E ask and status ‖ P2-F panels ‖ P2-G wall displays | G3 (local items) |
| 3 Integration | P3-A shared colleagues ‖ P3-B HTTP API and auth ‖ P3-D deploy smoke test; then P3-C web wiring; then P3-E demo e2e | G3 (public URL), G4, G5 |
| 4 Deploy and harden | P4-A production deploy ‖ P4-B hardening; then P4-C rehearsal | G6 |
| 5 Live meetings (optional, if time permits; decision D9) | P5-A call service ‖ P5-B call UI; then P5-C transcript from the call; then P5-D rehearsal | G7 |
| 6 Office life and receipts (owner request 2026-11-03; decisions D10, D15) | P6-0 contract and slots (lead); then P6-A status and desks ‖ P6-R receipts (USP A Phase 0) ‖ P6-B meetings, then P6-C notes; then P6-D free seating and board (if time); then P6-E demo | G8 |
| 7 Final review | Reviewer (owner hands over) | Sign-off |

**Team size and time.** The packages add up to roughly 20 agent-days. With one agent that is
three to four weeks; with four agents, about eight working days; with seven lanes in Phase 2, about
six. Phase 1 is sequential whatever the team size (one to two days), and Phase 3 to 4 cannot
usefully run more than three agents. Phase 5 adds about six agent-days when it runs; it is the
first thing cut when time is short, and the demo then uses the fixture transcript.

### Dependencies

A package starts when everything in its row is merged into `main` (and its phase is approved).

| Package | Needs first |
|---|---|
| P1-A contracts and shared simulation (P1-A1 net, sim, people ‖ P1-A2 api, demo) | nothing |
| P1-B tooling | nothing |
| P1-C app skeletons and slots | P1-A |
| P2-A room server | P1-A, P1-C |
| P2-B web networking | P1-A, P1-B, P1-C to start; P2-A to finish |
| P2-C database | P1-A, P1-B, P1-C |
| P2-D LLM and meetings, P2-E ask and status, P2-F panels, P2-G wall displays | P1-A, P1-C |
| P3-A shared colleagues | P2-A, P2-B |
| P3-B HTTP API and auth | P2-A, P2-C, P2-D, P2-E |
| P3-C web wiring and sign-in | P2-B, P2-F, P2-G to start; P3-B to finish |
| P3-D deploy smoke test | P2-A, P2-B, decision D3 |
| P3-E demo end to end | P3-B, P3-C (P3-A if it is in scope) |
| P4-A production deploy | Phase 3, decision D4 (hosted Supabase) |
| P4-B hardening | Phase 3 |
| P4-C rehearsal | P4-A, P4-B |
| P5-A call service | Phase 4, decision D9 (a LiveKit project) |
| P5-B call UI | Phase 4 to start; P5-A to finish |
| P5-C transcript from the call | P5-A, P5-B |
| P5-D live-meeting rehearsal | P5-C |
| P6-0 contract and slots | decision D10 |
| P6-A status and desks, P6-R receipts, P6-B meetings, P6-C notes | P6-0 |
| P6-D free seating and board | P6-A (seating), P6-0 (board) |
| P6-E office-life demo | P6-A, P6-B |

**Critical path:** P1-A, P1-C, P2-C, P3-B, P3-C, P3-E, P4-A, P4-C. Start P2-C as early as
possible: it is the longest Phase 2 lane on that path.

### 3.1 Deadline order (set 2026-11-03; deadline 2026-11-04, 21:00)

The deployed demo is what gets judged, so the deploy runs first and beside everything else.

| When | Work |
|---|---|
| Now | P4-A: apply the migrations and the seed to the hosted Supabase, set the Fly and Vercel env, deploy today's `main` (owner approves the deploy). In parallel, P6-0 (lead). |
| After P6-0 | P6-A ‖ P6-R ‖ P6-B, one agent each; P6-C when an agent is free. With fewer agents, keep this priority: P6-A, P6-R, P6-B, P6-C. |
| 2026-11-04, about 12:00 | P6-D only if P6-A and P6-B are merged and green. |
| 2026-11-04, 15:00 to 16:00 | **Feature freeze.** Unfinished cut-first tasks are dropped and reported. |
| Freeze to 21:00 | Merge, full checks and e2e, redeploy (P4-A), two-browser rehearsal on the public URL (P4-C, P6-E), the backup video (`DEMO_VIDEO.md`), an hour of buffer. |

Cut in this order if the day runs short: virtual meetings; P6-D board; P6-D free seating; P6-C
notes; receipt chips in Ask; the invite notice (keep booking and walking from the panel). Never
the Acme demo, the deploy, P6-A, or the receipt on the Acme wall.

**After the deadline:** the final review (Phase 7), then `docs/USP_A_IMPLEMENTATION_PLAN.md`
Phases 1 to 4 in its order (capture and guests, access and trust, ecosystem, depth), each behind
its gate and the owner's approval, then the leftover Phase 6 pieces and the Atrium and Village
layout studies.

## 4. Gates

**Gate P1: contracts and tooling** (lead; the owner is told)
- [ ] All schemas in `packages/shared/src/{net,api,sim,demo}` exist, with valid and invalid test cases.
- [ ] The people logic is in `packages/shared/src/people`; the office looks and behaves unchanged (before and after screenshots).
- [ ] `pnpm test:e2e` smoke test passes; two dev stacks run on different ports; local Supabase starts (or the blocker is reported).
- [ ] Server and web slots are mounted; `ARCHITECTURE.md` sections 4 and 5 describe the new contract.
- [ ] A lane agent who did not write the contracts has read them and section 12, and the lead has
      answered every question in the code or the docs (`HANDOFF.md` section 5).

**Gate G3: multiplayer** (from the original plan)
- [ ] Two browsers see each other move smoothly. (P2-A, P2-B)
- [ ] A tampered client cannot teleport or pass through walls (a test proves it). (P2-A)
- [ ] Reconnect restores state. (P2-A, P2-B)
- [ ] A public URL connects to the deployed server, or the blocker is reported. (P3-D)
- [ ] Added: other people are seen sitting, typing and at the counter, and colleagues are the same in both browsers. (P2-B, P3-A)

**Gate G4: memory backend** (from the original plan)
- [ ] Running the fixture transcript produces the expected proposed changes. (P2-D, P3-B)
- [ ] Approving changes updates the records and writes audit rows. (P2-C, P3-B)
- [ ] `/ask` returns a cited answer for the demo status question and abstains for the unsupported one. (P2-E, P3-B)
- [ ] With no LLM key, everything above still works through `FixtureLlm`. (P2-D, P2-E)
- [ ] An RLS test proves workspace isolation. (P2-C)
- [ ] No secrets in the repo.

**Gate G5: product UI and live propagation** (from the original plan)
- [ ] The full demo script from `PROJECT_BRIEF.md` passes locally in two browsers. (P3-E)
- [ ] The second user's view updates live after approval. (P3-C, P3-E)
- [ ] Rejected changes do not alter records. (P2-C, P3-E)
- [ ] The UI does not cover the centre of the scene. (P2-F)

**Gate G6: deployed demo** (from the original plan)
- [ ] The public demo completes end to end on the deployed app. (P4-A, P4-C)
- [ ] The reset script restores the starting state. (P4-B)
- [ ] Known limitations are documented. (P4-B)

**Gate G7: live meetings** (only if Phase 5 runs)
- [ ] Two browsers in the Acme room hear and see each other; a shared screen shows on the room's wall display. (P5-B)
- [ ] Tokens are issued only for the room the player is in; a test proves it. (P5-A)
- [ ] Microphone denied gives listen-only with a notice; with no LiveKit keys the office is unchanged. (P5-A, P5-B)
- [ ] A transcript captured from a live call produces proposed changes through the same pipeline, and the fixture demo still passes unchanged. (P5-C, P5-D)

**Gate G8: office life** (Phase 6). The items are in `WORK_PACKAGES.md` at the end of Phase 6.

## 5. Owner decisions

The lead must have these answered, or the default accepted, before the phase that needs them.
Record the answers in `docs/HANDOFF.md` section 3.

| ID | Decision | Default if the owner agrees | Needed by |
|---|---|---|---|
| D1 | Close G2 (movement feels smooth at 60 fps in your browser) | Approve | Phase 1 start |
| D2 | Visual freeze for M3 to M6 | Yes | Phase 1 start |
| D3 | Hosting: a static web host and a persistent WebSocket host | Web on Vercel; server on Fly.io or Render (Colyseus needs a long-lived process; serverless will not work) | P3-D |
| D4 | Supabase: local for development; a hosted project for deployment | Local Supabase CLI on Docker now; the owner creates the hosted project before Phase 4 | P2-C (local), P4-A (hosted) |
| D5 | LLM provider for the real adapter | Chosen 2026-11-01: `FixtureLlm` first; the real adapter is Muse Spark (`muse-spark-1.3`) through the Meta Model API, called with OpenAI's SDK (`LLM_PROVIDER`, `LLM_BASE_URL`, `LLM_MODEL`, `LLM_API_KEY` from env; `ARCHITECTURE.md` 12.5) | P2-D (adapter only) |
| D6 | Colleagues once multiplayer works | Keep them, run on the server, the same for everyone (P3-A); the alternative is to remove them when online | P3-A |
| D7 | Player contract adds look, pose, speed, activity and the seat reservations | Accept (P1-A) | Phase 1 |
| D8 | Demo sign-in | Supabase Auth with two seeded test users and a "Join as Maya / Arjun" picker locally; email and password when deployed | P3-C |
| D9 | Live meetings: voice, video, screen share and the transcript of a real meeting, with LiveKit | Yes, as the optional Phase 5 after G6, if time permits; the fixture transcript stays the demo's fallback and must keep working. The owner creates a LiveKit Cloud project before Phase 5 | Phase 5 |
| D10 | Office life (Phase 6) before the deadline, alongside the deploy | Approved by the owner, 2026-11-03 | Phase 6 |
| D11 | Home desks | Every person has a home desk in their department's team area; only they sit there. Sofas, café, lounge and other seats are free for anyone (owner, 2026-11-03) | P6-A |
| D12 | Colleagues (NPCs) | Keep a few for life in the office: four, at their own desks on their routines (owner, 2026-11-03) | P6-A |
| D13 | Meetings | In one of the existing rooms, never new geometry; when every room is busy, a virtual call-only meeting (needs LiveKit, so cut first) (owner, 2026-11-03) | P6-B |
| D15 | USP A Phase 0 (receipts) before the deadline | Yes, as P6-R (owner, 2026-11-03); USP A Phases 1 to 4 after the deadline | P6-R |
| D14 | Deploy mode | Fast mode is live since 2026-11-03: `AUTH_MODE=dev` with the in-memory repo (no `DATABASE_URL`, `NODE_ENV` not `production`), name picker, data lost on restart. The full deploy (Supabase Auth and Postgres) is optional and needs a Supabase project in Singapore beside the server (`HANDOFF.md` section 0); the owner decides | P4-A |

## 6. If time runs short

Cut in this order, never the memory loop or the demo script:
1. Phase 5, live meetings: the demo uses the fixture transcript (the static demo).
2. M7 stretch.
3. P3-A shared colleagues: hide colleagues when online instead.
4. P2-G wall displays: show the status in a DOM panel instead.
5. P4-B performance pass.
6. The real LLM adapter (P2-D task 2): demo on `FixtureLlm`, with the notice shown.

## 7. M7: stretch (only after G6, one at a time, each with owner approval)

Voice, captions, the transcript upload and screen share, which used to be here, are Phase 5.

1. Semantic search with pgvector for decision-history questions.
2. Engineering room: GitHub status on the project wall.
3. Shared snippet pad (Yjs plus CodeMirror, no execution).
4. Supabase Realtime in place of Colyseus invalidation broadcasts.
5. People polish: the unused "Sit To Type" / "Type To Sit" Mixamo moves for the seated-to-typing transition.
6. Captions through a speech-to-text provider in a LiveKit agent, if the browser route of P5-C is not good enough (a new account and a second process).

## 8. Stop conditions (every package and phase)

Stop and report if:
- A gate item or an acceptance item cannot be met after a reasonable attempt.
- A locked decision must change.
- A required service is missing or credentials fail.
- Scope would need to grow to finish the task.
- A test fails and the only way to pass it is to change the test.
- You need to change a file your package does not own, or a shared contract after Gate P1.
