# P3-B HTTP API, auth and live updates — checkpoint report

Work package / gate: P3-B HTTP API, auth and live updates (covers Gate G4 at HTTP level)
Status: passed

## Done

- **Endpoints** (`apps/server/src/http/routes.ts`): all of ARCHITECTURE.md section 5 plus
  `GET /proposed-changes?status=&meetingId=`. Bodies parsed with the shared Zod schemas
  (`MeetingCreate`, `AskRequest`, `ProposedChangeQuery`), responses validated through them
  (`MyDay`, `ProjectStatus`, `AccountStatus`, `Meeting`, `MeetingProcessResult`,
  `ProposedChangeList`, `OkResult`, `AskResult`). `/health` reports `version`, `authMode`,
  `llm` (unchanged shape). Errors: 401 unauthorized, 400 bad body/params/query, 404 unknown
  id, 409 change no longer pending, 429 rate-limited (with `Retry-After`), else 500.
  `POST /meetings` answers 201.
- **Auth** (`apps/server/src/auth/supabase.ts`): `SupabaseAuth` verifies the Bearer token
  with `jose` against `SUPABASE_JWKS_URL` (derived from `SUPABASE_URL` when unset; fails
  closed naming the variable), then resolves workspace + display name through a membership
  lookup cached 5 s (positive-only, so a fresh membership works immediately). `AUTH_MODE=dev`
  keeps working untouched through `DevAuth`.
- **`deps.ts`**: real `Repo` via `createPostgresRepo(DATABASE_URL)` when set, otherwise the
  in-memory repo (bare checkout still runs offline single-player); LLM via
  `createLlm({ apiKey, baseURL, model, answer: fixtureAnswer })` (Meta adapter with a key,
  `FixtureLlm` + P2-E `fixtureAnswer` without); `RegistryBus`; `DatabaseChatStore`; auth
  per `AUTH_MODE`. Membership lookup is service-side `memberships` + `profiles`
  (`ORDER BY workspace_id LIMIT 1`).
- **Approve**: repo transaction first, `bus.recordsChanged` after commit with the change's
  kinds (`milestones|commitments|tasks` + `proposed_changes`); no-longer-pending answers
  409. Reject writes its audit row (in the repo) and broadcasts `proposed_changes`.
  `POST /meetings` also broadcasts `meetings` + `proposed_changes` so the approval drawer
  appears live.
- **`POST /meetings`**: resolves fixture (`acme-sync`) or pasted transcript, reads a
  `RecordsSnapshot` from the repo, runs `processMeeting`, persists meeting + changes.
- **Chat**: `DatabaseChatStore` (`apps/server/src/http/chatStore.ts`) keeps the sync
  `ChatStore` shape, writes through to `chat_messages`, `flush()` awaits pending writes;
  failures report the error message only, never chat text. Proven against real Postgres;
  the room still owns its internal store (see Requests).
- **Limits**: per-user sliding-window limiter (300 req/min default, `Retry-After` on 429);
  CORS stays in `server.ts` (verified headers present; multi-origin gap filed, see Requests).
- **Room join**: `OfficeRoom.verifier` is assigned outside Owns (see Requests); the seam is
  proven by a test that plugs `SupabaseAuth` into `OfficeRoom.onAuth` and gets claims back.
- **Tests**: unit (`supabase`, `rateLimit`, `chatStore`, full route suite over the in-memory
  repo, 10 tests) + DB integration (`integration.test.ts`, 5 tests, each with its own
  workspace, removed afterwards): fixture flow with approvals/audit/409, HTTP workspace
  isolation, ask cited-after-approval + CEO abstention, chat persistence, and a **real
  local-Supabase user JWT verified against the live JWKS endpoint** through the production
  `buildDeps` wiring. Skip-with-warning precedent kept when Supabase is unreachable.

## Evidence

- `pnpm typecheck`: 3/3 pass. `pnpm lint`: 3/3 pass. `pnpm build`: pass.
- `pnpm test`: shared 107, web 58, server 129 passed + 3 skipped (skip-placeholders;
  DB suites ran, none skipped). No test changed or deleted.
- Live lane run (`PORT=2569`, dev auth, in-memory): fixture → 4 changes, approve → ok,
  second approve → 409, ask cited with `2026-11-22`, CEO abstains, no token → 401 (see
  curl session below). `AUTH_MODE=supabase` without a JWKS URL refuses to boot naming
  `SUPABASE_JWKS_URL`.
- Local Supabase: JWKS endpoint serves 1 ES256 key; migrations present; 0 leftover `p3b-*`
  workspaces after the suite. Supabase left running for other lanes (shared machine
  instance, per P1-B precedent). Lane server stopped; port 2569 verified free.
- No secrets: no `.env` touched or committed; test passwords are runtime-random.

## Deviations

- `processMeeting` runs before `createMeeting` (which assigns the meeting id), so the
  changes' `sourceMeetingId` is remapped to the persisted meeting id before `saveChanges`
  (mapping uses it only as a tag). No `Repo` change needed.
- `recordsChanged` is also sent after `POST /meetings` and after reject, not only approve:
  without it the approval drawer never appears/refreshes live. Same one-line pattern.
- Integration fixture uses an unscoped zone (`test_room`): random test ids cannot match
  `ROOM_RECORDS`, so matching runs by name — the same code path, deterministic in isolation.
  It also has no `profiles` (FK to `auth.users`), so the reassign change is `needsReview`
  and is rejected, not approved; milestone/commitment/task-create approvals still prove the
  transaction path on Postgres. The clean 4-change approve path is covered in-memory.
- Error envelope is `{ error, message }` with string codes; there is no shared HTTP error
  schema (only socket `ErrorCode`), so this adds no wire state type. P3-C note below.

## Files changed outside "Owns"

None.

## Requests

All verified still missing on this branch; lead to apply on `main` (none edited here):

1. `apps/server/src/server.ts` (P2-A carryover): add `.filterBy(["workspaceId"])` to
   `define("office", OfficeRoom)` — still a bare `define` at `server.ts:30`.
2. `apps/server/src/server.ts` or `index.ts` (P2-A carryover): assign
   `OfficeRoom.verifier = deps.auth` so room joins verify Supabase tokens — seam proven
   by `supabase.test.ts` ("plugs into the room join seam").
3. `turbo.json` (P2-C carryover): dev `env` allowlist still lacks `DATABASE_URL`,
   `SUPABASE_*`, `AUTH_MODE`, `ALLOWED_ORIGINS`, `LLM_*` — `pnpm dev` will not see them
   under Turbo strict mode.
4. `apps/server/src/room/office.room.ts`: route chat through `deps.chat`
   (`DatabaseChatStore`) so room messages persist to `chat_messages`; the room currently
   owns a private `InMemoryChatStore`.
5. `apps/server/src/server.ts`: CORS always echoes `origins[0]`; with several
   `ALLOWED_ORIGINS` it should echo the request origin when listed.
6. ARCHITECTURE.md 12.3 (P1-B carryover, confirmed): the HS256/`SUPABASE_JWT_SECRET`
   sentence is outdated — the local CLI signs ES256 over JWKS (verified: 1 EC key live).
   P3-B verifies with `jose` against `SUPABASE_JWKS_URL` locally and hosted.
7. Note for P3-C: `POST /meetings` answers **201**; errors are `{ error, message }`.
8. Note for the lead: `DevAuth` userIds (`dev-maya`) do not match demo record ownerIds
   (`maya`), so `/me/day` shows no owned tasks in dev mode. Untouched: `dev-maya` is
   pinned by P2-A room tests (not owned here). Production is unaffected (DB owner ids are
   auth UUIDs, equal to the JWT `sub`).

## How to verify

- `pnpm typecheck && pnpm lint && pnpm test && pnpm build` (from the worktree root).
- DB suites: `pnpm --filter @office/server exec vitest run src/http/integration.test.ts`
  (needs `pnpm db:start`; skips with a warning otherwise).
- Live: `PORT=2569 pnpm --filter @office/server exec tsx src/index.ts`, then the curl
  session below with `B=http://127.0.0.1:2569`.

## Open questions

None.

## Next

P3-C (web data wiring and sign-in) against this API; P3-E full demo script. Nothing started.

## Curl session (lane run, `PORT=2569`, dev auth, in-memory repo)

```bash
B=http://127.0.0.1:2569; H="Authorization: Bearer dev:Maya"; J="Content-Type: application/json"

$ curl -s $B/health
{"ok":true,"version":"0.1.0","authMode":"dev","llm":"fixture"}

$ curl -s -XPOST $B/meetings -H "$H" -H "$J" -d '{"zoneId":"acme_room","fixture":"acme-sync"}'
{"meetingId":"7220cbd6-05c5-4b0a-a88f-b8dac7bd5eb1","proposedChanges":[
  {"type":"milestone_date","before":{"targetDate":"2026-11-15"},"after":{"targetDate":"2026-11-22"},...},
  {"type":"commitment_update",...},
  {"type":"task_reassign",...},
  {"type":"task_create",...}]}

$ curl -s "$B/proposed-changes?status=pending" -H "$H"   # 4 changes
$ curl -s -XPOST $B/proposed-changes/<milestone-id>/approve -H "$H"
{"ok":true}
$ curl -s -o /dev/null -w '%{http_code}\n' -XPOST $B/proposed-changes/<milestone-id>/approve -H "$H"
409

$ curl -s -XPOST $B/ask -H "$H" -H "$J" -d '{"question":"What is the status of the Acme Payments Integration?"}'
{"answer":"Project Acme Payments Integration. Go-live is due 2026-11-22 (upcoming). ...",
 "abstained":false,"sources":[...]}
$ curl -s -XPOST $B/ask -H "$H" -H "$J" -d '{"question":"Who is Acme'"'"'s CEO?"}'
{"answer":"I don't have a record of that.","abstained":true,"sources":[]}

$ curl -s $B/me/day -H "$H"     # followup + meeting items
$ curl -s -o /dev/null -w '%{http_code}\n' $B/me/day
401
```
