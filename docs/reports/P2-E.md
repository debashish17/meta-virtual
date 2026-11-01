Work package / gate: P2-E Ask the office and status queries
Status: passed
Done:
- Status builders (`apps/server/src/status/`): pure `buildMyDay` / `buildProjectStatus` /
  `buildAccountStatus` over plain data plus read-only `myDay(repo, claims, userId)` /
  `projectStatus(repo, claims, id)` / `accountStatus(repo, claims, id)` wrappers that do the
  `Repo` reads. Every `DayItem` carries a reason; unknown project/account ids throw the
  shared `NotFoundError`; outputs are parsed with the shared `MyDay` / `ProjectStatus` /
  `AccountStatus` schemas.
- Ask (`apps/server/src/ask/`): `classifyQuestion` (deterministic rules: "my day"
  variants, decision keywords, then seeded project/account name matching with a
  project-on-more-tokens / account-on-fuller-coverage tie-break), `retrieveForAsk`
  per class over `Repo` reads, `askQuestion` pipeline (abstain on `other` or empty
  retrieval without calling the LLM; `llm.answer` with only the retrieved envelopes;
  invalid shapes retried once then abstained; unknown/empty citations abstained;
  labels resolved from the retrieved set; final `AskResult` schema check).
- `fixtureAnswer(question, records)` in `ask/fixtureAnswer.ts`: composes the answer
  from the retrieved records (dates/owners/status read live, never hardcoded),
  abstains with the fixed message on empty retrieval, off-record topics (CEO, …) or
  questions without an answerable topic. Usable records must parse with their shared
  schema. Signature matches P2-D's `AnswerFn` for the `createLlm` answer slot.
- 27 tests (`ask.test.ts` 18, `status.test.ts` 9, written first) over `InMemoryRepo`:
  status question cites existing records; CEO abstains; unknown-ID citation abstains
  without retry; invalid shapes retry once; `other` never calls the LLM;
  decision-history abstains with no meetings and answers once one exists; my-day ask
  answers from the user's records; statuses and answers reflect 22 Nov after the four
  demo changes are approved.
Evidence:
- `pnpm typecheck`: 3/3 pass. `pnpm lint`: 3/3 pass.
- New tests: `src/ask/ask.test.ts` 18 passed, `src/status/status.test.ts` 9 passed.
- `pnpm --filter @office/shared --filter @office/web test`: 14 files / 107 tests and
  5 files / 24 tests, all pass.
- Server suite: every test file passes (incl. 13 files / 72 passed + 12 db-skipped in
  one run), but the runner exits 1 on a pre-existing vitest-pool crash AFTER tests
  pass: Colyseus monitor's `axm:monitor` `process.send` ("Unexpected call to
  process.send()"). Proven unrelated: reproduces with `ask/**`+`status/**` excluded,
  and running the untouched `src/server.test.ts` alone (2/2 pass, then the same
  crash). Logs: `/tmp/p2e-test-full.log`, `/tmp/p2e-noe.log`, `/tmp/p2e-server-alone.log`,
  `/tmp/p2e-green.log`.
- `pnpm --filter @office/server build`: success (dist/index.js).
- Exercise (`/tmp/p2e-exercise.mts`, tsx; log `/tmp/p2e-exercise.log`): myDay lists
  Maya's tasks + follow-up; statuses show 15 Nov; status ask answers with 6 sources;
  CEO abstains; after approving the four demo changes the answer says 22 Nov, the
  webhook fix is owned by arjun, and "Notify Acme of new date" appears.
- Server boots on the lane port (`PORT=2568`, `/health` answers
  `{"ok":true,…,"llm":"fixture"}`); process stopped afterwards, port verified free.
Deviations:
- Classification is rules-only: the `LlmClient` contract (P1-C) offers no classifier,
  so "then the LLM only if needed" is implemented as the LLM composing the answer
  only when rules + retrieval produced records. Documented in `classify.ts`.
- Invalid answer shapes are retried once (ARCHITECTURE.md 12.5: pipelines retry,
  then fall back to abstain); unknown-ID citations abstain immediately with no retry.
- The raw `{ answer, sourceIds }` check is manual, not Zod: `zod` is not a server
  dependency (only P1-B edits the lockfile); the final `AskResult` still goes through
  its shared schema.
- `fixtureAnswer` states task owners as the `ownerId` verbatim (e.g. `arjun`): people
  names are not records and `answer(question, records)` carries nothing else.
Files changed outside "Owns": none.
Requests:
- P3-B (`deps.ts`, owned by P1-C/P3-B): wire
  `createLlm({ apiKey: env.LLM_API_KEY, baseURL: env.LLM_BASE_URL, model: env.LLM_MODEL, answer: fixtureAnswer })`
  with `fixtureAnswer` from `../ask/index.js`; `GET /me/day`, `GET /projects/:id/status`,
  `GET /accounts/:id/status` call the status builders; `POST /ask` parses `AskRequest`,
  calls `askQuestion({ repo, claims, userId: claims.userId, question, llm })`.
- Lead: the `pnpm test` exit-1 vitest-pool crash (Colyseus `axm:monitor` `process.send`,
  in `src/server.test.ts` / room-test workers) predates P2-E and needs a P1-B/P2-A-side
  fix or quarantine; P2-E evidence is in the per-file runs above.
How to verify:
- `pnpm typecheck && pnpm lint`
- `pnpm --filter @office/server exec vitest run src/ask/ask.test.ts src/status/status.test.ts`
- `pnpm --filter @office/server exec tsx /tmp/p2e-exercise.mts`
- `pnpm --filter @office/server build`
Open questions: none. D3/D4/D6/D8 are not needed for this package.
Next: P3-B can wire the status builders and `askQuestion` behind the HTTP API with the
`fixtureAnswer` slot; the fixture demo then answers the status question end to end.
Not started.
