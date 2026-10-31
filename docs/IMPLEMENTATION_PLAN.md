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

The original M0 to M2 task lists are in git history (commit `a5d9085`).

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

## 3. Phases

| Phase | Packages (agents in parallel) | Gates it closes |
|---|---|---|
| 1 Foundations | P1-A contracts and shared simulation, then P1-C app skeletons (lead) ‖ P1-B tooling | Gate P1 |
| 2 Parallel lanes | P2-A room server ‖ P2-B web networking ‖ P2-C database ‖ P2-D LLM and meetings ‖ P2-E ask and status ‖ P2-F panels ‖ P2-G wall displays | G3 (local items) |
| 3 Integration | P3-A shared colleagues ‖ P3-B HTTP API and auth ‖ P3-D deploy smoke test; then P3-C web wiring; then P3-E demo e2e | G3 (public URL), G4, G5 |
| 4 Deploy and harden | P4-A production deploy ‖ P4-B hardening; then P4-C rehearsal | G6 |
| 5 Final review | Reviewer (owner hands over) | Sign-off |

### Dependencies

A package starts when everything in its row is merged into `main` (and its phase is approved).

| Package | Needs first |
|---|---|
| P1-A contracts and shared simulation | nothing |
| P1-B tooling | nothing |
| P1-C app skeletons and slots | P1-A |
| P2-A room server | P1-A, P1-C |
| P2-B web networking | P1-A, P1-B, P1-C |
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

**Critical path:** P1-A, P1-C, P2-C, P3-B, P3-C, P3-E, P4-A, P4-C. Start P2-C as early as
possible: it is the longest Phase 2 lane on that path.

## 4. Gates

**Gate P1: contracts and tooling** (lead; the owner is told)
- [ ] All schemas in `packages/shared/src/{net,api,sim,demo}` exist, with valid and invalid test cases.
- [ ] The people logic is in `packages/shared/src/people`; the office looks and behaves unchanged (before and after screenshots).
- [ ] `pnpm test:e2e` smoke test passes; two dev stacks run on different ports; local Supabase starts (or the blocker is reported).
- [ ] Server and web slots are mounted; `ARCHITECTURE.md` sections 4 and 5 describe the new contract.

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

## 5. Owner decisions

The lead must have these answered, or the default accepted, before the phase that needs them.
Record the answers in `docs/HANDOFF.md` section 3.

| ID | Decision | Default if the owner agrees | Needed by |
|---|---|---|---|
| D1 | Close G2 (movement feels smooth at 60 fps in your browser) | Approve | Phase 1 start |
| D2 | Visual freeze for M3 to M6 | Yes | Phase 1 start |
| D3 | Hosting: a static web host and a persistent WebSocket host | Web on Vercel; server on Fly.io or Render (Colyseus needs a long-lived process; serverless will not work) | P3-D |
| D4 | Supabase: local for development; a hosted project for deployment | Local Supabase CLI on Docker now; the owner creates the hosted project before Phase 4 | P2-C (local), P4-A (hosted) |
| D5 | LLM provider for the real adapter | `FixtureLlm` first; one real adapter chosen by the owner (`LLM_PROVIDER`, `LLM_MODEL` from env) | P2-D (adapter only) |
| D6 | Colleagues once multiplayer works | Keep them, run on the server, the same for everyone (P3-A); the alternative is to remove them when online | P3-A |
| D7 | Player contract adds look, pose, speed, activity and the seat reservations | Accept (P1-A) | Phase 1 |
| D8 | Demo sign-in | Supabase Auth with two seeded test users and a "Join as Maya / Arjun" picker locally; email and password when deployed | P3-C |

## 6. If time runs short

Cut in this order, never the memory loop or the demo script:
1. M7 stretch.
2. P3-A shared colleagues: hide colleagues when online instead.
3. P2-G wall displays: show the status in a DOM panel instead.
4. P4-B performance pass.
5. The real LLM adapter (P2-D task 2): demo on `FixtureLlm`, with the notice shown.

## 7. M7: stretch (only after G6, one at a time, each with owner approval)

1. Live captions or a pasted-transcript upload instead of the fixture only.
2. Voice with LiveKit in meeting rooms (server-issued tokens, mute, mic-denied handling).
3. Semantic search with pgvector for decision-history questions.
4. Engineering room: GitHub status on the project wall, screen share.
5. Shared snippet pad (Yjs plus CodeMirror, no execution).
6. Supabase Realtime in place of Colyseus invalidation broadcasts.
7. People polish: the unused "Sit To Type" / "Type To Sit" Mixamo moves for the seated-to-typing transition.

## 8. Stop conditions (every package and phase)

Stop and report if:
- A gate item or an acceptance item cannot be met after a reasonable attempt.
- A locked decision must change.
- A required service is missing or credentials fail.
- Scope would need to grow to finish the task.
- A test fails and the only way to pass it is to change the test.
- You need to change a file your package does not own, or a shared contract after Gate P1.
