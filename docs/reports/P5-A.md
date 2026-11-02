# P5-A Call service

Work package / gate: P5-A Call service
Status: passed

Done:

- `POST /calls/token { zoneId }` (body parsed with the shared `CallTokenRequest`):
  caller presence is read from the office room's live state through the room
  registry (`getRoom(workspaceId)`, `ARCHITECTURE.md` 12.2); the client's zone
  claim is never trusted. The zone must exist and be a `meeting_room`,
  `customer_room` or `project_room`, and the caller must be in it right now,
  or the endpoint answers 403 `forbidden`.
- Token via `livekit-server-sdk` `AccessToken` (offline signing, no network):
  LiveKit room `${workspaceId}--${zoneId}`, identity the user id, name the
  display name, grant join + publish + subscribe for that one room, one-hour
  TTL. Response parsed with the shared `CallTokenResponse` (`{ url, token }`).
- Per-user rate limiting through the existing HTTP `UserRateLimiter` (shared
  with every other endpoint; 429 with `Retry-After`).
- No `LIVEKIT_*` set: the endpoint answers 503 `calls_off` and `/health`
  reports `calls: "off"`; with all three set it reports `calls: "on"`. Every
  live path is guarded on creds/state, so the office and the fixture demo work
  unchanged either way.
- Tests first, in `apps/server/src/calls/`: 12 unit tests (grant scoping via
  `TokenVerifier` with in-code generated keys, TTL, zone-type and presence
  refusals, off-mode) and 8 HTTP tests (real route + real registry with a stub
  room: 200 grants, 403 cases, 503 + office unaffected, 400/401, per-user 429,
  `/health` on/off).

Evidence:

- `pnpm typecheck`, `pnpm lint`: pass (3/3 workspace tasks each).
- `pnpm test`: pass (3/3 tasks; server 158 passed + 3 pre-existing skips,
  including the 20 new calls tests; shared + web green).
- `pnpm build`: pass (server bundles with `@office/shared`; web builds).
- Live exercise on `PORT=2568` (`node apps/server/dist/index.js`):
  `/health` shows `calls:"off"` without keys and `calls:"on"` with generated
  test keys; `POST /calls/token` gives 503 `calls_off` without keys, 403
  `forbidden` with keys but nobody connected, 400 on `{}`, 401 without auth,
  and `/me/day` stays 200 throughout. Server stopped afterwards, port 2568
  verified free. No e2e package tests for P5-A (none defined).
- G7 token scoping proven by tests: a verified token carries `roomJoin` for
  exactly `${workspaceId}--${zoneId}` with `canPublish`/`canSubscribe` and no
  create/admin/list/record grants; any other zone, an open-plan or kitchen
  zone, or no connection gives 403.

Deviations: none. `POST /calls/token` reuses the shared per-user limiter
rather than a dedicated one; that is the rate limit the package requires.

Files changed outside "Owns": none.

Requests: none. (`CallTokenRequest`/`CallTokenResponse` and the LiveKit SDKs
were already on the base commit via the lead's Phase 5 contract.)

How to verify:

- `git checkout wp/P5-A-call-service` (in this worktree) then from the repo
  root: `pnpm typecheck`, `pnpm lint`, `pnpm test`.
- `cd apps/server && npx vitest run src/calls` for the 20 package tests.
- Serve and probe: `PORT=2568 node apps/server/dist/index.js`, then
  `curl localhost:2568/health` and
  `curl -X POST localhost:2568/calls/token -H "Content-Type: application/json"
  -H "Authorization: Bearer dev:Maya" -d '{"zoneId":"acme_room"}'`
  (503 `calls_off` without keys; with `LIVEKIT_URL`, `LIVEKIT_API_KEY`,
  `LIVEKIT_API_SECRET` set, 403 until a client joins and stands in that zone).

Open questions: none.

Next: P5-B Call UI (joins on zone entry with these tokens) and P5-C
transcript; not started.
