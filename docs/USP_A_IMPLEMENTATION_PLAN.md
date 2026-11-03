# USP A Implementation Plan — "The office that remembers, with receipts"

> Status: Plan only. No code in this file has been built yet.
> USP chosen by owner: **USP A** (see §2). This plan sits on top of
> [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) (Phases 1–6, Gates P1–G7)
> and does not replace it. Where this plan and that plan disagree, that plan
> wins for M0–M6 demo delivery; this plan governs everything after G6.
> Product: Virtual Office — [PROJECT_BRIEF.md](./PROJECT_BRIEF.md).
> Architecture and locked decisions: [ARCHITECTURE.md](./ARCHITECTURE.md),
> [AGENTS.md](../AGENTS.md) §4.

---

## 1. Why this plan exists

Market research (Nov 2026, official product/pricing pages) found:

- No shipped product combines all three parts of our loop: (a) fixed-isometric
  office, (b) meetings extracted into shared operational/customer records with
  human-approved writes, (c) cited "status of project X / what's going on
  with Acme" answers with an explicit "no record" refusal.
- The market splits in two: spatial offices (Gather, Kumospace, Sococo, SoWork,
  Roam) sell presence; meeting tools (Granola, Fireflies, Fathom, tl;dv,
  Notion, Glean) sell capture, summaries and CRM/search. Neither half alone
  completes the meetings → records → ask loop.
- Closest threats are **SoWork** (only isometric rival + AI meeting memory)
  and **Roam** (office bundle + bot-free summaries + office-watching agent).
  See §3 for the feature detail this plan is built against.

This plan turns that finding into phased work: first prove the USP on the
loop that already exists, then close the table-stakes gaps that would stop a
team from adopting it, then differentiate.

## 2. USP A — definition (owner-approved direction)

**"The office that remembers, with receipts."**

- Every approved change shows before → after, source meeting, and approver —
  on the floor (wall display), not only in a drawer.
- Every "ask the office" answer cites record + meeting + approver, or abstains
  with the fixed line "I don't have a record of that."
- Hero moment: walk to the Acme wall and read
  "Go-live moved 15 → 22 Nov · from Acme sync · approved by Maya."
- Defence is trust and provenance, not feature count. The approval gate and
  the cite-or-abstain rule — our strictest constraints — become the brand.

Hard rules that follow from the USP (never break in public):

1. AI writes only through approved `proposed_changes`. No autonomous writes.
2. An answer with no supporting retrieved record abstains. Never guess.
3. Every citation must resolve to a record the requester may see.

Existing code this builds on (do not re-build):

- Extraction → `ProposedChange` (before/after, `needsReview`,
  `sourceMeetingId`): `packages/shared/src/api/index.ts`.
- Approve in transaction + `audit_log` + `records_changed` broadcast:
  `apps/server/src/db/repo.ts`, `docs/ARCHITECTURE.md` §7.
- Cited-or-abstain ask: `apps/server/src/ask/pipeline.ts`,
  `packages/shared/src/api/index.ts` (`AskResult` contract).
- Deterministic demo: `FixtureLlm` + `acme-sync` fixture (4 changes) in
  `packages/shared/src/demo/index.ts`. The demo must keep working with no
  network, no API key and no microphone.

## 3. Competitor snapshot (evidence for the gaps in §4)

### 3.1 SoWork — closest rival

Source: sowork.com/pricing, sowork.com features (fetched Nov 2026).

- 2.5D isometric world + Simplified Mode (non-world UI) + MapMaker for
  custom offices, desks and zones.
- Spatial video, Slack-like chat (DMs/threads/channels), multi-screenshare
  with draw, recordings.
- Sophia AI auto-records zone meetings → summaries, transcripts, action
  items, decisions. MCP server lets Claude/ChatGPT search summaries.
- Team analytics on Premium. Integrations: Google/Outlook Calendar, Slack,
  GitHub, Zapier, Miro, API.
- Pricing: Free up to 10 (30-min, no AI), Basic $6/user/mo ($5.40 annual),
  Premium $15 ($12 annual), Enterprise custom SSO/SCIM.
- Gap for us: public pages show searchable summaries, not extraction into
  structured accounts/projects/milestones/tasks/commitments with an approval
  queue and cited status retrieval. Overlap [ESTIMATE] ~60%.

### 3.2 Roam — second-closest

Sources: ro.am/virtual-office, ro.am/magic-minutes, ro.am/on-it,
ro.am/pricing (fetched Nov 2026).

- Nine products in one bundle: Virtual Office (Cloud HQ room map), Drop-In
  Meetings, Theater, AInbox chat, Lobby, Magicast, Magic Minutes, On-It,
  On-Air, plus Mobile.
- Presence is room-click, not walkable avatar. Guest-free access, Developer API.
- Magic Minutes: bot-free transcript + summary + action items per meeting.
- On-It: agent on the org chart — watches the office, joins meetings, picks
  up action items, chats in AInbox.
- Pricing: one Super Bundle, pay only active members,
  ~$19.50/active member/mo [ESTIMATE USD; official fetch geo-localised to INR].
- Gap for us: summary/watch-alert centred, not structured records update +
  cited "status of project X" answers. Overlap [ESTIMATE] ~55%.

### 3.3 Wider field (one line each)

- Gather 2.0: proximity A/V + AI notes/search at scale, $12–15/user/mo, no records.
- Fireflies: strongest write-side rival — review-gated CRM autofill
  (HubSpot/Salesforce custom fields), AskFred cited meeting search, $10–39.
- Notion Business $20: AI Meeting Notes + Enterprise Search + Agents bundled;
  already the records home for many teams (threat to our records ownership).
- Glean / Read AI / Slack Enterprise Search: permission-aware federated
  search with citations — the bar for "ask" beyond our own records.
- Incumbents (Slack, Teams, Zoom, Workspace) bundle ~80% of presence +
  meetings + AI search inside suites IT already bought. We integrate with
  them; we do not replace them.

## 4. What they have that we don't (feature gaps)

Severity: **table-stakes** = buyers expect it, absence blocks adoption;
**differentiator** = wins deals when present; **enterprise blocker** =
procurement/security stops the sale.

| # | Gap | Who proves it | Severity |
|---|---|---|---|
| G1 | Capture outside the office (Zoom/Meet/Teams/phone/in-person) | Granola botless, Fireflies auto-join | table-stakes |
| G2 | CRM sync (field-level, review-gated) | Fireflies, Fathom, tl;dv | enterprise blocker (sales-led) |
| G3 | Federated search beyond own records | Glean, Read, Notion, Slack | differentiator |
| G4 | Async catch-up ("while you were away") | Linear, Asana, Loom, Slack recaps | table-stakes |
| G5 | Guest/customer journey into the office | Sococo links, Roam guest-free | table-stakes |
| G6 | Mobile approve/ask + accessibility (WCAG, captions audit) | Granola mobile, incumbent a11y | table-stakes |
| G7 | SSO/SCIM, retention, audit export, SOC 2 story | Every Enterprise tier | enterprise blocker |
| G8 | Meeting intelligence depth (talk-time, trends, clips) | Fireflies, Fathom, tl;dv reports | differentiator |
| G9 | Customisation (MapMaker/templates) + timed onboarding | WorkAdventure, Gather, SoWork | differentiator |
| G10 | Performance proof (light client) + Simplified Mode | SoWork/Roam non-world modes | table-stakes |
| G11 | Public API / MCP for records + ask | Granola, Fireflies, Otter, SoWork | differentiator → table-stakes |
| G12 | Recording consent UX + moderation (block/report/kick) | Granola deletion, Otter litigation | enterprise blocker |

Our current state against these (from code, not doc claims): capture is
fixture/pasted transcript only; records are internal with no CRM sync; ask
retrieves only own records for `my_day` / `project_status` /
`account_status`; mobile is out of MVP scope; no monetisation exists yet.
LiveKit live media is code-merged but rehearsal is credential-blocked —
do not sell live meetings until rehearsed end to end.

## 5. Principles for this plan

1. **USP first.** Every phase must make a receipt more visible, more
   trustworthy, or available in more places. A feature that does none of
   these waits.
2. **Locked decisions hold** ([AGENTS.md](../AGENTS.md) §4): pnpm + Turborepo,
   TypeScript strict, React/Vite/Three/R3F, Colyseus 0.18 server-authoritative
   at fixed tick, Zod in `packages/shared` for socket/HTTP/LLM, Supabase
   Postgres with RLS, no physics engine, fixed isometric camera (no orbit).
3. **Contracts first.** New payloads land in `packages/shared/src/{net,api}`
   with valid + invalid Zod tests before lanes build against them.
4. **Fixture first.** Every new path works with `FixtureLlm`, the in-memory
   repo and the mock API before the real provider/DB is wired in.
5. **One package, one owner.** Follow the file-ownership and gate discipline
   in [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) §2–§4 and
   [HANDOFF.md](./HANDOFF.md) §5. Shared-contract changes after Gate P1 are
   lead-owned; lanes file Requests.
6. **Tests first** for extraction, approval, ask, consent and sync logic.
   Never change or delete a test to make it pass.
7. **No new dependency, service or paid tool without owner approval**
   (see §10 open decisions). File it as a Request; do not install it.

## 6. Phases overview

| Phase | Name | Closes gaps | Gate |
|---|---|---|---|
| 0 | Receipts Core (USP A proof) | — (makes USP visible) | U0 |
| 1 | Capture + Guests + Consent | G1, G5, G12 | U1 |
| 2 | Access + Trust minimum | G6, G7, G10 | U2 |
| 3 | Ecosystem (MCP, CRM, async) | G2, G3, G4, G11 | U3 |
| 4 | Depth + Scale (later, on pull) | G8, G9 + residency | U4 |

Run phases in order. A phase starts only when the previous gate passed and
the owner approved the next phase (same rule as
[IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md): "At every gate: stop,
send the checkpoint report, and wait for the owner").

Effort below is [ESTIMATE] in agent-days for one lane agent, excluding owner
wait time. Validate with the lead after Phase 0 before committing Phase 1+.

---

## 7. Phase 0 — Receipts Core (USP A proof)

**Goal:** the existing demo loop visibly proves USP A. No new capture, no new
integrations — only provenance made visible everywhere.

**Why now:** the approval + citation machinery already exists; buyers cannot
see it. This is the cheapest differentiation we own.

### Scope

In:
- Receipt line on every `ProposedChange`: source meeting title, extraction
  time, approver name, approval time, before → after diff.
- Wall display (customer room + project room) renders the latest approved
  receipts for that account/project, plus current status.
- Ask answers render each citation as a receipt chip (record, meeting,
  approver) that deep-links to the record and the meeting.
- Rejected changes show "rejected by {name}" in history; they never appear
  as receipts and never alter records.
- `audit_log` read model exposed to the UI (workspace-scoped, RLS-respecting).

Out: new record types, new ask intents, CRM, MCP, mobile layout.

### Tasks

1. Contract: extend `ProposedChange` view model in `packages/shared/src/api`
   with receipt fields (meeting title, approver display name). Zod tests:
   valid receipt, missing approver, cross-workspace ID rejected.
2. Server: `audit_log` → receipt read model in `apps/server/src/db/repo.ts`
   (or sibling read module owned by the lead); endpoint follows the existing
   HTTP contract + mock/http parity suite.
3. Web: receipt row in approval drawer; receipt chips in ask panel; wall
   display receipt list (reuse P2-G wall display slots — do not rebuild 3D).
4. Demo: extend `acme-sync` assertions — after approval, Arjun's wall shows
   "Go-live 15 → 22 Nov · Acme sync · Maya"; CEO question still abstains.

### Acceptance (Gate U0)

- [ ] Approving a change shows its receipt to the second user live
      (`records_changed`, no refresh) with meeting + approver named.
- [ ] Rejecting a change leaves records unchanged and shows no receipt.
- [ ] Ask answer citations each resolve to a retrieved record; an answer
      citing an outside ID is discarded and abstains (existing test holds).
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test` pass; demo e2e (P3-E
      `demo.spec`) still green.
- [ ] Screenshot of Acme wall with receipt, checked against
      [DESIGN_SPEC.md](./DESIGN_SPEC.md) visual freeze (no new 3D).

### Risks if skipped

USP stays invisible; we compete as "another virtual office" at $12–16.

---

## 8. Phase 1 — Capture + Guests + Consent

**Goal:** the office remembers meetings that happen outside it, with the
customer in the room, lawfully. Closes G1, G5, G12.

### Scope

In:
- Transcript ingest endpoint: calendar webhook or manual upload →
  Zod-validated transcript → existing `LlmClient.extractMeeting` pipeline
  (transcript-in; not coupled to LiveKit). Fixture first.
- Guest journey: signed, expiring guest token (jose, same verify path as
  Supabase JWT) scoped to one zone + one meeting; view-only; no records
  write; customer-visible record view filtered at repo layer.
- Consent: per-meeting consent banner, per-participant opt-out stored on
  the `meetings` row, transcript retention setting, GDPR delete endpoint.
- Moderation minimum: kick + block in room, chat report (extends existing
  1–500 char / 5-per-10s chat limits).

Out: bot joining Zoom/Meet/Teams, botless desktop audio capture, phone
dial-in. Those need new services — owner decision first (§10).

### Tasks

1. Contract: ingest payload + guest claims + consent fields in
   `packages/shared`; invalid cases tested (expired token, wrong zone,
   cross-workspace meeting ID).
2. Server: ingest route reusing `apps/server/src/meetings/pipeline.ts`;
   guest auth mode beside `AUTH_MODE=dev|supabase` (no client-supplied
   workspace ID, ever).
3. Web: guest join link flow (no account), consent banner, retention
   settings surface (admin only).
4. Tests: guest cannot read other zones/records (RLS test), opt-out blocks
   extraction, delete removes transcript + derived proposals.

### Acceptance (Gate U1)

- [ ] A pasted/uploaded external transcript produces the same receipt flow
      as the fixture (propose → approve → wall receipt → cited ask).
- [ ] A guest joins only the invited room, sees only the filtered view,
      and cannot mutate records (server test proves it).
- [ ] A participant opt-out prevents recording/extraction for that meeting.
- [ ] Fixture demo (`demo.spec`) still passes with no key and no mic.

### Risks if skipped

Highest-value meetings (customer calls) happen elsewhere; the Acme demo
cannot actually include Acme; EU/two-party-consent exposure (Otter
litigation) with no consent story.

---

## 9. Phase 2 — Access + Trust minimum

**Goal:** a real team can adopt it daily without a new procurement fight.
Closes G6, G7, G10.

### Scope

In:
- Simplified Mode: 2D list/zone view rendered from the same `PlayerView`
  state (`packages/shared/src/net`) without Three.js; same receipts, chat
  and ask. (Proof: SoWork Simplified Mode, Roam room list.)
- Performance budget: published min-spec, video-tile cap, lightweight
  default on low-end devices. Measure in a real visible browser, not
  headless (see [HANDOFF.md](./HANDOFF.md) §4).
- Mobile approve/ask only: responsive approval drawer + ask UI over the
  existing HTTP API. Full 3D stays desktop.
- SSO via Supabase Auth (extends `AUTH_MODE=supabase`); SCIM sync into
  `memberships`; retention enforcement + `audit_log` export endpoint;
  public trust page (DPA, no-train, retention defaults, SOC 2 roadmap).

Out: native mobile apps, full mobile 3D, HIPAA BAA, DLP/eDiscovery.

### Tasks

1. Web: Simplified Mode shell reusing shared sim state; feature-parity
   checklist (presence, chat, receipts, ask) tested both modes.
2. Server: SCIM provisioning/offboarding; retention job; audit export
   (workspace-admin role check — enumerate role values first; today the
   role enum is unstated in inventory).
3. Accessibility pass: keyboard-only office navigation, captions audit,
   colour/motion review. Record WCAG target in the report; do not claim
   compliance without an audit.
4. Perf: FPS + memory measurement with 2 players + 9 colleagues in a real
   browser; publish min-spec; fix regressions only.

### Acceptance (Gate U2)

- [ ] Approval completed on a phone browser; receipt appears on desktop live.
- [ ] Simplified Mode completes the demo script without WebGL.
- [ ] SSO login + SCIM deprovision removes access (test); audit export
      matches `audit_log` rows for the workspace.
- [ ] Accessibility + performance results written in the phase report
      (measured numbers, not claims).

### Risks if skipped

Low-end laptops churn (Gather 16 GB-RAM evidence); approver not at desk
kills the "live" promise; enterprise deals stall at SSO/retention review.

---

## 10. Phase 3 — Ecosystem (MCP, CRM, async)

**Goal:** receipts live where buyers' AI already lives, without giving up
the approval gate. Closes G2, G3, G4, G11.

### Scope

In:
- MCP server + public API: cited ask + records read via existing
  `AskResult` / `ProposedChange` Zod contracts. Writes stay approval-gated.
  (Proof: Granola/Fireflies/Otter/SoWork all ship MCP in 2026.)
- HubSpot-first CRM sync through the ProposedChange queue: field-mapping
  table, email-based record matching, sync reuses the approval UI.
  Sync, do not replace — permanent non-goal is Salesforce/HubSpot parity.
- Async catch-up digest: "since you were away" diff from `audit_log`,
  delivered on reconnect and in `/me/day`.
- Federated ask (read-only v1): Slack/Drive/Jira connectors indexed into
  the retrieval set with source-ACL check before LLM compose; citations
  carry URL + record ID.

Out: autonomous CRM writes, sentiment/emotion inference (EU AI Act),
sales coaching scorecards.

### Tasks

1. Contract: MCP tool shapes + connector citation shape in
   `packages/shared`; permission tests (connector item invisible to
   requester must never enter retrieval).
2. Server: MCP/API surface over `apps/server/src/ask/pipeline.ts` retrieve
   step; HubSpot sync worker with mapping + conflict (409) handling.
3. Web: sync review in approval drawer (same receipt line, plus CRM target);
   digest view on join.

### Acceptance (Gate U3)

- [ ] Claude/ChatGPT via MCP returns a cited answer identical in sources
      to the in-office ask; writes via MCP still require approval.
- [ ] A HubSpot field update appears as a ProposedChange, applies only on
      approval, and shows a receipt naming the CRM record.
- [ ] A user offline during an approval sees the change in the digest on
      return; no change is lost or double-applied.
- [ ] Connector citations never leak items the requester cannot open
      (permission test).

### Risks if skipped

Walled garden while the ecosystem standardises on MCP; double-entry
distrust without CRM sync; synchronous-only penalty for async teams.

---

## 11. Phase 4 — Depth + Scale (later, only on customer pull)

Do not schedule until a named customer or gate asks for it.

- Cross-meeting intelligence: scheduled validated jobs over `meetings`
  (trend reports, e.g. "which objections this week"); no EU sentiment.
- MapMaker/templates + timed onboarding (name → first meeting < 5 min);
  placements are already data-driven in `packages/shared/src/world`.
- Presence analytics (zone/activity aggregates, privacy-reviewed).
  **No employee scoring — permanent non-goal.**
- Self-host / EU residency docs (Supabase self-host + single-process
  Colyseus is already portable); pgvector decision-history search
  (M7 stretch) only after Phase 1 capture feeds it.

Gate U4: each item ships alone with its own acceptance + report; no
big-bang release.

---

## 12. Positioning and pricing (validate before building billing)

No monetisation exists in the product today. Do not build billing until
willingness-to-pay is validated with design partners.

**Positioning:** sell "the office that remembers" — meetings update shared
project/customer records with human approval; ask gets a cited answer or
an honest abstention. Do not sell "virtual office" (presence commodity,
$12–16/user/mo) or "AI notetaker" (commodity, $10–20/user/mo).

Wedge buyer [ESTIMATE]: founder / Head of Ops or Customer Success at a
10–100-person remote-first services/agency team where customer status
("what's going on with Acme?") is the daily pain. IT enters only at the
SSO gate (Phase 2).

| Option | Price anchor | Trade-off |
|---|---|---|
| Per-member bundle $15–20 | Gather $12–15, Kumospace $16, SoWork Premium $15, Roam ~$19.50 | Directly comparable; must win on receipts, not presence |
| Records-led $20–25, office included | Notion Business $20 (AI+Meetings+Search), Slack $15 + notetaker $10–19 | Premium needs Phase 1 capture + Phase 3 CRM proof, else churn to Notion |
| Free demo → team $12 | Kumospace Free 5, SoWork Free 10 (30-min, no AI) | PLG volume vs 3D hosting cost per concurrent room |

Packaging rules from the market: cap transcription hours / AI credits,
not guest seats (guest view free, recorder pays); SSO/SCIM/HIPAA/custom
retention only on Enterprise. All prices [ESTIMATE] from Nov 2026 official
pricing pages; re-check before publishing.

## 13. Sequencing, ownership and verification

- One work package per phase chunk, one branch + worktree per package,
  per [HANDOFF.md](./HANDOFF.md) §5. Lanes edit only files their package
  owns; shared-contract changes go through the lead as Requests.
- Critical path: Phase 0 receipt contract → Phase 1 ingest + guest auth →
  Phase 3 MCP/CRM. Phase 2 Simplified Mode can run parallel to Phase 1
  web work (different files); server SCIM work cannot.
- Every package: tests first, then
  `pnpm typecheck`, `pnpm lint`, `pnpm test`, and `pnpm test:e2e` where
  the package has e2e tests. Report in `docs/reports/<ID>.md` using the
  [AGENTS.md](../AGENTS.md) §8 format. Only the lead merges.
- Visual work: screenshot at 1440×810 compared with
  `docs/reference/office-reference.png` per [DESIGN_SPEC.md](./DESIGN_SPEC.md);
  the visual freeze holds — wall-display content changes, no new 3D.

## 14. Risks

- **Incumbent bundling:** Slack/Teams/Zoom already open, already bought.
  Mitigation: integrate (calendar, Slack, CRM, MCP), never position as
  a sixth app to replace the suite.
- **Always-on feeling / surveillance perception.** Mitigation: records and
  ask must be useful with an empty office (Phase 3 digest); explicit away
  status; no employee scoring, ever.
- **Novelty fade** (Teamflow shut down Nov 2023; Pragli/Pesto pivoted).
  Mitigation: value survives solo use; export/portability of records.
- **Rivals close the gap:** SoWork Sophia + MCP and Roam On-It already
  ship AI on product pages (GA status unverified). Window is receipts +
  approval + cited-status depth. Mitigation: ship Phase 0 fast; run a
  hands-on SoWork/Roam trial before making external differentiation claims.
- **Legal:** two-party-consent states, GDPR per-person consent, EU AI Act
  emotion ban, recording litigation. Mitigation: Phase 1 consent +
  retention before any live capture marketing. Never publish transcription
  accuracy percentages — no vendor publishes audited WER.

## 15. Evidence gaps (do not quote externally until closed)

- Category not exhaustive: SpatialChat/Remo/Wonder/Kosy/Around/Horizon
  Workrooms/Microsoft Mesh and Gong/Chorus/Clari/Avoma/Fellow etc. were
  not researched; Webex/Viva not covered.
- Roam USD price has no official USD fetch (INR only); Fireflies monthly
  price conflicts across sources ($18 vs $19); Kumospace "no AI" rests on
  competitor blogs; Gather scale has no official capacity doc.
- SoWork/Roam AI GA vs announced status not captured — needs hands-on trial.
- Our side: Meta `muse-spark-1.3` live verification unverified without an
  API key; production deploy and LiveKit rehearsal blocked on owner
  credentials; 60 fps not re-measured in a real browser for this plan;
  room/query limits, export/GDPR-delete and undo-after-approval unstated.

## 16. Open decisions (owner, before the phase that needs them)

| ID | Decision | Needed by |
|---|---|---|
| U-D1 | Wedge buyer confirmed (Ops/CS-led SMB) + USP A wording final | Phase 0 report |
| U-D2 | Capture route: upload/webhook only, or fund bot/botless service | Phase 1 start |
| U-D3 | Pricing option (bundle vs records-led vs PLG) + billing provider | Before any billing build |
| U-D4 | CRM first target (HubSpot assumed) + API credentials owner | Phase 3 start |
| U-D5 | Trust target: SOC 2 Type II timeline, DPA owner, retention defaults | Phase 2 start |
| U-D6 | Hands-on SoWork + Roam trial accounts for gap verification | Before external claims |

## 17. Next step (not started)

Owner approves this plan and U-D1, then the lead cuts Phase 0 into work
packages in [WORK_PACKAGES.md](./WORK_PACKAGES.md) style (Owns, tests,
acceptance per package) and starts with the receipt contract. Do not start
Phase 1 capture or Phase 3 CRM/MCP until the earlier gate passed.




