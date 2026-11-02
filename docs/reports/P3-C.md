# P3-C Web data wiring and sign-in — checkpoint report

Work package / gate: P3-C Web data wiring and sign-in (covers G5 live propagation at web level)
Status: passed

## Done

- **`apps/web/src/api/http.ts`** (new): `createHttpApi({ baseUrl, getToken })`
  implementing `OfficeApi` over ARCHITECTURE.md section 5. Every response is parsed
  with the shared Zod schemas; the token goes on every call as the Bearer [REDACTED]
  `POST /meetings` accepts 201; `listPending` always sends `status=pending` (plus
  `meetingId=`); errors become `ApiError(status, code, message)` keeping the server's
  `{ error, message }` text verbatim (so the approvals panel's "no longer pending"
  conflict refresh matches), with `http_<status>` fallback for non-envelopes and
  status 0 / `network` when the server is unreachable. Zero-arg defaults (server URL
  from `VITE_SERVER_URL`, token from the auth session) are what the lead's one-line
  `api/index.ts` wiring calls (see Requests).
- **`apps/web/src/auth/session.ts`** (new): auth session. `authMode()` is `dev`
  unless `VITE_AUTH_MODE=supabase`; lazy supabase-js client (missing env throws
  naming `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`, never values); seeded users
  Maya/Arjun with the documented local-only password, sent only to loopback
  Supabase URLs (`isLocalSupabaseUrl`); `getAuthToken()` returns `dev:<name>` in
  dev mode and the live session otherwise, so a refreshed token is used on the
  next (re)connect; `onAuthStateChange` keeps the store token fresh and signs out
  on `SIGNED_OUT`.
- **`apps/web/src/auth/AuthGate.tsx`** (was pass-through): dev mode joins straight
  in (no network) with a non-blocking name picker (bottom-right chip; hidden in
  `?view=overview`) that rejoins with the new name and reloads records — blocking
  would break the existing smoke/multiplayer specs, which join with no click (see
  Deviations). Supabase mode blocks on a sign-in screen: Join-as-Maya/Arjun
  through Supabase Auth locally, an email + password form when deployed (also
  shown locally as a fallback); loading ("Signing in…") and error states inline,
  session restore on mount.
- **`apps/web/src/net/connection.ts`** (token handling only): `joinLoop` sets
  `client.auth.token` from `getAuthToken()` on every attempt; `reconnectLoop`
  refreshes it before every `reconnect()`.
- **`api/http.contract.test.ts`** (new): the P1-C contract suite against the
  running stack, skipped unless `E2E_STACK=1` (server URL from `E2E_SERVER_URL`,
  `dev:Maya` token); each case rejects leftover pending changes first, so the
  file is self-isolating on a shared server.
- **Task 3 (`records_changed` refetch)** needed no code: P2-B already routes it
  to `useRecords.refetch`, which the http api now serves; wall displays read the
  same store. Proven live (see Evidence). Task 4 states: AuthGate loading/error,
  typed `ApiError`s for the panels' existing error pills, reconnecting via the
  untouched net-store status P2-F already renders.
- **Tests** (31 new, all passing): `http.test.ts` (15, stubbed fetch),
  `session.test.ts` (8), `AuthGate.test.tsx` (8, mocked supabase-js).

## Evidence

- `pnpm typecheck`: 3/3 pass. `pnpm lint`: 3/3 pass. `pnpm build`: pass.
- `pnpm test`: shared 107, web 89 passed + 4 skipped (the gated live-stack
  contract file), server 138 passed + 3 skipped (pre-existing placeholders).
  No test changed or deleted.
- **Contract suite live**: `E2E_STACK=1` against a throwaway in-memory server —
  4/4 pass (`/tmp/p3c-srv2570.log`).
- **G5 live** (`/tmp/p3c-g5v6.mjs`, log `/tmp/p3c-g5v6.log`): two pages (dev +
  http api, fresh in-memory server): Maya processes the fixture → both drawers
  show "Approvals (4)"; Maya clicks Approve → both show "Approvals (3)",
  Arjun with no reload (`__p3cNoReload` flag intact, net=online); Arjun's ask
  answers "Go-live is due 2026-11-22" with 7 sources. Box notes: full-viewport
  second pages could not join here (seat-reservation expiry under SwiftShader
  load), so the proof uses 640x360 tabs with rAF frozen after join — socket,
  React, fetch and CDP do not use rAF; server broadcasts verified separately
  (`/tmp/p3c-bus.mjs`: 201 in 4 ms + `[meetings, proposed_changes]`, approve in
  3 ms + `[milestones, proposed_changes]`).
- **Supabase sign-in live** (`/tmp/p3c-auth.mjs`, 76 s): Join-as-Maya button →
  signed in, online, HTTP ask cited (6 sources); Arjun via the email form →
  online, both players visible. Seeded users pre-verified (both 200).
  Screenshot `/tmp/p3c-signin.png`.
- **Dev chip live** (`/tmp/p3c-chip.mjs`, 39 s): chip switch → rejoin as Arjun,
  net players `["Arjun"]`; no "Demo data" pill under `VITE_API=http`.
- **Offline** (`/tmp/p3c-off.mjs`, 38 s, no server, mock web): ready, status
  offline, My day loads, mock ask abstains, chip works. Screenshot
  `/tmp/p3c-chip2.png`.
- `pnpm test:e2e`: both specs fail on this box identically with and without
  my changes — multiplayer times out the 60 s online wait at spec line 32
  (5.1 m with changes, 5.0 m stashed baseline; same `waitForFunction` timeout),
  smoke's browser died after 15.2 m. Box contention (load ~5, matchmaking seat
  expiry — the same signature my probes hit), not a regression. Baseline and
  with-changes logs: `/tmp/p3c-e2e-base.log`, `/tmp/p3c-e2e.log`. P3-C has no
  e2e of its own; the live proofs above cover its acceptance.
- Lane servers stopped; ports 5174/2568 verified free afterwards.

## Deviations

- Dev-mode AuthGate does **not** block on the picker: it auto-joins with the
  stored/`?name=`/default name and offers the picker as a chip. A blocking gate
  would break the existing smoke spec (fresh context, no name, expects
  `__officeReady` with no click) and multiplayer spec, which no package may
  edit. The picker still satisfies "name picker (no network)".
- The email + password form also renders locally (below the Join-as buttons),
  so a `SEED_PASSWORD` override does not lock anyone out; deployed it is the
  only control, per the package text.
- No sign-out control: AuthGate has no post-sign-in surface that does not cover
  the scene; switching users is a fresh context (demo) or the dev chip (dev).
- Live browser proofs ran with the requested `api/index.ts` one-liner applied
  temporarily (exact diff in Requests) and reverted before commit; the
  committed tree is Owns-only. The G5 run additionally used two tabs in one
  context instead of two contexts (dev-mode identity is per-page `?name=`, so
  isolation is irrelevant) with rAF frozen after join (box contention, see
  Evidence); the asserted product path is unchanged.

## Files changed outside "Owns"

None in the committed tree. `apps/web/src/api/index.ts` was patched only as an
uncommitted local verification aid and reverted (byte-identical restore
verified via `git status`).

## Requests

1. (Lead, blocks G5/P3-E on `main`) Wire the http api in `apps/web/src/api/index.ts`
   (P1-C-owned; verified live with exactly this):
   ```diff
   +import { createHttpApi } from "./http.js";
    import { createMockApi } from "./mock.js";
   @@
      if (import.meta.env.VITE_API === "http") {
   -    throw new Error("The http OfficeApi lands in P3-C; unset VITE_API to use the mock.");
   +    return createHttpApi();
      }
   ```
2. (Lead/server) Consider refetching records on room rejoin: a client that drops
   and rejoins inside the window misses `records_changed` broadcasts while away
   (observed once on this box pre-heartbeat-relaxation). `attach()` in
   `connection.ts` is the spot, but it is outside this package's token-only
   allowance.
3. (Pre-existing, noted for P3-E) The SDK warns `onMessage() not registered for
   type 'chat_history'` on every join (P2-B's known attach race); harmless here.

## How to verify

- `pnpm typecheck && pnpm lint && pnpm test && pnpm build` (worktree root).
- Contract live: `PORT=2570 pnpm --filter @office/server dev`, then
  `E2E_STACK=1 E2E_SERVER_URL=http://127.0.0.1:2570 pnpm --filter @office/web exec vitest run src/api/http.contract.test.ts`.
- Browser proofs (need Request 1 applied on `main` + `VITE_API=http` web):
  `node /tmp/p3c-g5v6.mjs`, `SEED_PASSWORD=<local-only> node /tmp/p3c-auth.mjs`
  (supabase stack via `/tmp/p3c-sup-stack.sh`), `/tmp/p3c-off.mjs`.
- Screenshots: `/tmp/p3c-signin.png`, `/tmp/p3c-chip2.png`.

## Open questions

None.

## Next

P3-E full demo script (needs Request 1 on `main`); P3-D smoke. Nothing started.
