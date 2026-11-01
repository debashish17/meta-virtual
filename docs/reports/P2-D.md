Work package / gate: P2-D LLM client and meeting pipeline
Status: passed
Done:
- `FixtureLlm` (`apps/server/src/llm/fixture.ts`): the `acme-sync` transcript returns the
  extraction that maps to the four expected changes; any other transcript returns a
  summary-only result. `answer` calls the constructor-injected function and abstains
  (`I don't have a record of that.`) until P3-B wires in P2-E's `fixtureAnswer`.
- Meta adapter (`apps/server/src/llm/meta.ts`): Muse Spark via the Meta Model API through
  OpenAI's SDK (`openai` 7.47): Chat Completions, `timeout: 30_000`, `maxRetries: 1`,
  reasoning effort `low`, reply requested as JSON. `response_format` defaults to
  `json_schema` with the shared schema (`ExtractionResult.toJSONSchema()`), with a
  `json_object` fallback option; the schema also travels in the system prompt either way.
  The key travels only in the auth header; record content never leaves the request body
  (debug sink carries metadata only and is unwired by default).
- `createLlm` (`apps/server/src/llm/factory.ts`): Meta adapter when `apiKey` is set,
  otherwise `FixtureLlm` (`/health` already reports which one is running).
- Pipeline (`apps/server/src/meetings/pipeline.ts`): Zod-validate, retry once with the
  validation error (via `FeedbackLlm` when the client supports it, else a plain re-call),
  then fall back to a summary-only result carrying the `Could not extract...` notice.
  A throwing LLM (unavailable) follows the same retry-then-fallback path.
- Pure mapping (`apps/server/src/meetings/map.ts`): `ExtractionResult` to `ProposedChange[]`
  against a records snapshot, narrowed by the meeting's room through `ROOM_RECORDS`.
  Unconfident matches get `targetId: null` and `needsReview: true`, carrying the extracted
  names for the reviewer. Update-with-no-deltas emits nothing.
- 25 tests (`fixture`, `factory`, `meta` incl. stub-transport request assertions, `map`,
  `pipeline`), plus a `testSnapshot` helper over the shared demo data.
Evidence:
- `pnpm typecheck`: 3/3 pass. `pnpm lint`: 3/3 pass. `pnpm test`: 3/3 pass; server
  74 passed + 2 skipped in 14 files (baseline 49 + 2 in 9; the 5 new P2-D files add
  25: fixture 4, factory 2, meta 6, map 7, pipeline 6). No existing test was touched.
- `pnpm --filter @office/server build`: success (dist/index.js, 911 KB).
- Pipeline exercised (`/tmp/p2d-exercise.mts`, tsx): fixture transcript gives
  `milestone_date,commitment_update,task_reassign,task_create` with milestone after
  `{"targetDate":"2026-11-22"}` and `fallback: false`; a pasted transcript gives a
  summary with 0 changes; a garbage-returning LLM is called twice, then falls back with
  the `Could not extract...` notice. Logs: `/tmp/p2d-typecheck2.log`, `/tmp/p2d-lint.log`,
  `/tmp/p2d-test.log`, `/tmp/p2d-build.log`.
- The 3 live verifications are UNVERIFIED: no `.env` file exists and `LLM_API_KEY` is
  unset, so everything was built and verified against fixtures (as the package allows).
  SDK-side finding: `openai` 7.47 accepts `response_format: {type: "json_schema", ...}`
  and `reasoning_effort` (values `none|minimal|low|medium|high|xhigh|max`, matching
  ARCHITECTURE.md 12.5's list with `xhigh` = "extra high"); whether the Meta Model API
  accepts them still needs one real call each (see Requests).
Deviations:
- Retry-with-error is an optional `FeedbackLlm` interface (`meta.ts`) probed via
  `supportsFeedback`, so P1-C's `LlmClient` contract in `types.ts` is untouched
  (clients without it are plainly re-called once, which still satisfies retry-then-fallback).
- `toJSONSchema` is called as the schema's own method (`ExtractionResult.toJSONSchema()`):
  identical output to `z.toJSONSchema(...)` with no `zod` import in the server (zod is not
  a server dependency and only P1-B edits the lockfile). Verified byte-shape via probe.
- The pipeline also falls back when the LLM call itself throws (ARCHITECTURE.md section 10,
  "LLM unavailable"), not only on invalid output.
- Commitment update-vs-create rule (documented in code): same-account exact text match, or
  a single candidate sharing 2+ tokens with the extracted text, updates; otherwise creates.
Files changed outside "Owns": none. `apps/server/src/llm/types.ts` (P1-C) untouched;
  `deps.ts`/`routes.ts` wiring left to P3-B (see Requests).
Requests:
- P3-B (deps.ts, owned by P1-C/P3-B): build `llm` via
  `createLlm({ apiKey: env.LLM_API_KEY, baseURL: env.LLM_BASE_URL, model: env.LLM_MODEL, answer: fixtureAnswer })`;
  `POST /meetings` resolves fixture/transcript, reads a `RecordsSnapshot` from the `Repo`,
  runs `processMeeting`, then persists the meeting and changes.
- Owner/lead (needs the Meta key in the server's `.env`, never committed): run the 3 live
  checks, e.g. `pnpm --filter @office/server exec tsx /tmp/p2d-live.mts` with a script that
  calls `new MetaLlm({ baseURL, model, apiKey }).extractMeeting(ACME_SYNC_TRANSCRIPT, ...)`
  once with `responseFormat: "json_schema"` (accept or error?), once with `"json_object"`,
  and records wall-clock ms at `low` against the 30 s timeout; report back so the default
  can be pinned.
How to verify:
- `pnpm typecheck && pnpm lint && pnpm test` (server P2-D files: `src/llm/*.test.ts`, `src/meetings/*.test.ts`).
- `pnpm --filter @office/server exec tsx /tmp/p2d-exercise.mts` (fixture, pasted, and garbage-LLM paths).
- `pnpm --filter @office/server build`.
Open questions: none. D3/D4/D6/D8 are not needed for this package.
Next: P3-B can wire `createLlm` + `processMeeting` behind `POST /meetings`; P2-E can rely on
  the fixture's injected `answer` slot and the `{ answer, sourceIds }` raw answer shape
  (validated on the P2-E side). Not started.
