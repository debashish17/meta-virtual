# P1-C App skeletons and slots — checkpoint report

Work package / gate: P1-C App skeletons and slots (Phase 1, after P1-A)
Status: passed

## Done

Server (`apps/server/src/`):

- `server.ts`: `createServer(deps)` builds the one Node process (Express + Colyseus, CORS
  from `ALLOWED_ORIGINS`). Builds without listening so tests choose their own port.
- `env.ts`: environment parsed at startup; a bad value stops the server naming the variable,
  never its value (empty string counts as unset). `AUTH_MODE=dev` refused in production.
  Hand-parsed: `zod` is not a server dependency and only P1-B edits the lockfile.
- `deps.ts`: `deps = { env, version, repo, llm, auth, bus, chat }`, built from env.
  `version` is `GIT_COMMIT` or the package version. `AUTH_MODE=supabase` refuses with a
  clear message until P3-B lands.
- `http/routes.ts`: `httpRoutes(app, deps)` with only `/health`, answering
  `{ ok, version, authMode, llm }` (`llm` is `fixture` without a key, else the provider).
- `room/schema.ts`: Colyseus state mirroring `PlayerView`/`NpcView` field for field, plus a
  test that the names equal the shared types' keys. Wire mappings (documented in the file,
  P2-B maps them back): `activity.kind ""` means null (a null child schema crashes the
  5.0.42 encoder, verified live), `zoneId ""` means null (no nullable primitives).
- `room/office.room.ts`: the stub P2-B connects to until P2-A merges. Validates
  `JoinOptions`, refuses a stale `protocol`, spawns at `WORLD.spawn`, removes on leave.
  No tick, no messages, no auth yet (`userId` is the session id).
- Interfaces plus the simplest working implementation: `db/repo.ts` (`Repo` + in-memory
  repo over the demo data: reads, meetings, changes, one-shot `approveChange`/`rejectChange`
  per type with audit rows, chat, membership, workspace scoping), `llm/types.ts`
  (`LlmClient` + `StubLlm`), `auth/verify.ts` (`AuthVerifier` + `DevAuth`, production
  refused), `room/bus.ts` (`RoomBus` + recording `StubBus`), `room/chat.ts` (`ChatStore` +
  capped in-memory store).
- `index.ts` rewritten: load env, build deps, listen on `PORT`.

Web (`apps/web/src/`):

- Slots, each mounted once and rendering nothing yet: `net/Players.tsx` and
  `office/displays/WallDisplays.tsx` inside the canvas in `OfficeScene.tsx` (6-line diff),
  `ui/Panels.tsx` next to `<Hud />`, `auth/AuthGate.tsx` wrapping the app in `App.tsx`
  (passes children through).
- `net/store.ts`: the Zustand net store contract (`status`, `selfId`, `players`, `npcs`,
  `chat`, no-op `send.chat`/`send.status`).
- `api/types.ts`: the `OfficeApi` interface; `api/mock.ts`: the in-memory implementation
  over the demo data (approve/reject mutate the records; ask answers the status question
  from current records and abstains otherwise); `api/index.ts`: the mock unless
  `VITE_API=http` (which fails loudly until P3-C); `api/records.ts`: the Zustand records
  store (`myDay`, `pending`, `project`, `account`, `meeting`, `load()`, `refetch(kinds)`).
- `api/contract.ts`: the contract suite (fixture gives four pending changes; approve three
  and reject one, then my day and the statuses reflect it; the two ask outcomes; a second
  decision is rejected). `mock.contract.test.ts` runs it here; P3-C runs it against the
  server.

Tests:

- Server: env (defaults, empty-is-unset, names-not-values, prod refusal), `DevAuth`
  (mapping, malformed tokens, prod refusal), in-memory repo (seed, approve+audit,
  reassign/create types, double decision, reject unchanged, workspace scoping), schema
  mirror (Player/Npc/Look/Activity names + PlayerView mapping), `createServer` boots and
  `/health` answers (default and configured version/llm).
- Web: the contract suite against the mock (4 tests), records store load/refetch (2 tests).

## Evidence

- `pnpm typecheck`: 3/3 pass. `pnpm lint`: 3/3 pass. `pnpm test`: 3/3 pass (shared 107,
  server 21 in 6 files, web 7 in 3 files). `pnpm build`: ok (web + server).
- `pnpm test:e2e`: 1/1 smoke passes (3.4m, two contexts reach `__officeReady`).
- `pnpm dev` runs: `/health` answers
  `{"ok":true,"version":"0.1.0","authMode":"dev","llm":"fixture"}`; the built bundle
  (`node apps/server/dist/index.js`, port 2579) answers the same.
- Stub room joined over a real socket (`@colyseus/sdk` script, deleted after): 1 player at
  spawn (14.75, 37.40), pose stand, look round-trips, leave ok; `protocol: 0` refused with
  `protocol_mismatch: expected 1`.
- Screenshot `/tmp/p1c-office.png` (1440x810, `?view=overview`): identical to
  `docs/screenshots/office-m2-overview.png` (same rooms, furniture, name pills; only live
  traffic differs). `docs/reference/office-reference.png` is absent from this checkout,
  so the comparison is against the M2 screenshot.
- All dev processes I started were killed; ports 5173/2567/5190/2590 verified free.
- No `meetings/`, `ask/`, `status/` stub files were created: the task list requires no
  code there (P2-D/P2-E own those folders and will create them); the server has no
  "mounted slots" to hold.

## Deviations

- Built in the shared checkout on `main`, uncommitted, per instructions (no worktree or
  branch of my own). My files: the new `apps/server/src/{auth,db,http,llm,room}/`,
  `deps.ts`, `env.ts`, `server.ts` + tests, the new `apps/web/src/{api,auth,net,ui}/` and
  `office/displays/`, the `index.ts` (server) rewrite onto `createServer`, and 6 added
  lines across `App.tsx`/`OfficeScene.tsx` (reviewer correction: the 6-line count never
  covered `index.ts`). Nothing committed, nothing merged.
- `room/schema.ts` does not use decorator syntax: interfaces carry the types (erased) and
  the `@type` calls run as plain code after each class, with constructor assignment. This
  is required, not stylistic: `@type` installs prototype setters, but every declared field
  becomes an own data property under tsx's transform (proven: tsx defines even bare
  `x!: T` declarations and ignores `useDefineForClassFields: false` and `target`), which
  shadows the setter, breaks change tracking, and crashes the encoder on the first join
  with state. The file documents this; the mirror test reads `Symbol.metadata` instead of
  `Object.keys`. One file-scoped `eslint-disable` for `no-unsafe-declaration-merging`
  covers the pattern.
- `server.test.ts` filters `axm:*` IPC messages for its file: `Server.listen()` dynamically
  imports `@pm2/io` when it resolves (colyseus `Stats.reset`), which spams the vitest forks
  pool channel and fails the run. Plain node is unaffected (verified). P2-A's room tests
  will need the same guard (see Requests).
- `env.ts` is hand-parsed instead of Zod (server has no `zod` dependency; see Requests).
- `deps` carries `env` and `version` in addition to the listed five, so `/health` can
  report the configuration without a second parameter.

## Files changed outside "Owns"

- None. (`apps/server/tsconfig.json` was edited twice during diagnosis and reverted both
  times; `git status` confirms no diff. The M0 `apps/server/src/office.room.ts` and
  `src/index.test.ts` were deliberately left untouched — see Requests.)

## Requests

1. (Lead) `useDefineForClassFields` cannot save the schema under tsx, but P2-A must keep
   the interface + manual-`@type` pattern in `room/schema.ts` (or prove another pattern
   encodes over a real socket before merging). Suggested: keep the file's warning comment.
2. (Lead) P2-A's room tests need the `axm:*` IPC filter from `server.test.ts`; consider a
   shared test setup for it.
3. (Lead) `turbo.json` dev env allowlist needs the new server vars (`AUTH_MODE`,
   `ALLOWED_ORIGINS`, `LLM_*`, `DATABASE_URL`, `SUPABASE_*`) — same request P1-B filed.
   Not edited (outside Owns).
4. (Lead) Delete the M0 `apps/server/src/office.room.ts` and repoint `src/index.test.ts`
   (or hand both to P2-A): they are orphaned by `src/room/office.room.ts` but outside
   every Phase 1 package's Owns.
5. (Lead) Consider adding `zod` to `apps/server` dependencies so `env.ts` (and P2-A's
   message parsing) can use the shared schemas' validator directly; until then both
   hand-roll.
6. (Lead) `docs/reference/` is empty in this checkout (no `office-reference.png`, no asset
   boards); the visual check compared against `docs/screenshots/office-m2-overview.png`.

## How to verify

- `pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e && pnpm build`
- `pnpm dev`, then `curl http://localhost:2567/health` and open
  `http://localhost:5173/` (walk, sit, counter; `?view=overview` for the whole floor).
- Join the stub room: from `apps/web`, `node -e` with `@colyseus/sdk`,
  `joinOrCreate("office", { protocol: 1, displayName, workspaceId, look })`.

## Open questions

- None for the owner. D3/D4/D6/D8 remain open but P1-C needs none of them.

## Next

- Gate P1 items this unblocks: P1-C merged, slots mounted. Phase 2 lanes (P2-A…P2-G)
  can start once the gate is approved; P2-B connects to the stub room until P2-A merges.
  Not started.

## Reviewer verification (2026-11-01)

Re-ran fresh in this session: `pnpm typecheck` 3/3, `pnpm lint` 3/3,
`pnpm test --force` 3/3 (shared 107/14 files, server 21/6, web 7/3),
`pnpm build` 2/2, `pnpm test:e2e` 1/1 smoke (3.3m, two contexts reach
`__officeReady`). Live on `pnpm dev`: `/health` answers
`{"ok":true,"version":"0.1.0","authMode":"dev","llm":"fixture"}`; stub room
joins over a real socket (1 player at spawn 14.75/37.40, pose stand, look
round-trips, leave ok) and refuses `protocol: 0`, empty `displayName`, extra
fields and missing `look` with the expected codes (probe kept at
`C:/tmp/p1c-room-probe.mjs`, outside the repo). Screenshot
`C:/tmp/p1c-review-overview.png` (1440x810, `?view=overview`) matches
`docs/screenshots/office-m2-overview.png` apart from live traffic. Slots each
mounted once and rendering null; entry diffs limited to the slot mounts, the
`AuthGate` wrap and the `index.ts` rewrite; no existing test modified; secrets
scan clean (only variable names and a fake test value). Endorsed open requests:
turbo dev allowlist (verified still missing the server vars), orphaned M0
`office.room.ts`, `zod` for the server. One-line fix above (the 6-line count);
no code changes needed. e2e artifacts removed; dev processes killed, ports free.
