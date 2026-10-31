# ARCHITECTURE.md

## 1. Overview

```
Browser (React + R3F, Zustand)
  ├─ WebSocket ─────► Colyseus room  (movement, presence, chat, change notifications)
  └─ HTTPS ─────────► HTTP API        (meetings, proposed changes, ask, my-day)
                          │   (same Node process as Colyseus)
                          ├─► LlmClient (provider or FixtureLlm)
                          └─► Supabase Postgres (+ Auth, RLS)
```

One deployable server process hosts both the Colyseus room and the HTTP API. This keeps the MVP to one backend deploy and lets the API notify the room directly after an approved change.

**Real-time decision (MVP):** record changes reach other users through a Colyseus broadcast (`records_changed`) that tells clients which queries to refetch. Supabase Realtime is a post-MVP upgrade; it is not needed for the demo and adds a second live connection.

Later phases add LiveKit (voice), GitHub webhooks and Yjs. They are not part of this document's contracts.

## 2. Packages and dependency direction

```
apps/web ───► packages/shared ◄─── apps/server
```

- `apps/web` and `apps/server` never import from each other.
- `packages/shared` imports nothing from the apps.

**Build rule:** `shared` is consumed as TypeScript source in development (Vite and tsx handle it). The server is built with `tsup` (or esbuild) with workspace packages bundled in (`noExternal: ["@office/shared"]`), so the deployed server does not depend on unbuilt TypeScript. Verify this with `pnpm build` and `node apps/server/dist/index.js` before the first deployment.

## 3. World model (`packages/shared/src/world`)

- Units: metres. Y is up. Ground plane is X (east) by Z (south).
- Origin at the north-west (back-left) corner of the floor. X grows east, Z grows south.
- Footprint: 24 m (X) by 16 m (Z). Initial values; tune against the reference.
- Walkability grid: 0.5 m cells, derived at load time from obstacle rectangles. Both client and server compute it from the same data.
- Obstacles: axis-aligned rectangles (`{ id, x, z, w, d }`) for walls, glass partitions, furniture. Glass rooms have door gaps.
- Zones: named rectangles with a type: `meeting_room`, `customer_room`, `project_room`, `kitchen`, `open_plan`.
- Furniture placements: array of `{ type, x, z, rotY }` rendered by reusable components.

Exports: `WORLD`, `OBSTACLES`, `ZONES`, `FURNITURE`, `isWalkable(x, z)`, `zoneAt(x, z)`, `findPath(from, to)`.

## 4. Multiplayer contract (Colyseus)

Room: `office` (one room per workspace). Join options validated with Zod:

```ts
JoinOptions = { displayName: string; workspaceId: string; accessToken: string }
```

The server verifies `accessToken` (Supabase JWT) before admitting the client.

**Synchronized state (Colyseus Schema)**

```ts
Player = {
  id: string; userId: string; name: string;
  x: number; z: number; facing: number;       // radians
  status: "available" | "in_meeting" | "away";
  zoneId: string | null;
}
```

**Client → server messages**

| Message | Payload | Rules |
|---|---|---|
| `move_intent` | `{ seq: number; dx: -1\|0\|1; dz: -1\|0\|1 }` | Sent at a fixed rate while a key is held; server normalizes and clamps speed |
| `move_target` | `{ seq: number; x: number; z: number }` | Server computes path with `findPath`; rejects unwalkable targets |
| `chat_send` | `{ text: string }` | 1 to 500 chars, trimmed, rate-limited |
| `status_set` | `{ status: Player["status"] }` | Optional |

**Server → client messages**

| Message | Payload |
|---|---|
| `chat` | `{ id, userId, name, text, ts }` |
| `zone_event` | `{ userId, zoneId, kind: "enter" \| "leave" }` |
| `records_changed` | `{ kinds: ("tasks" \| "milestones" \| "commitments" \| "proposed_changes" \| "meetings")[] }` |
| `error` | `{ code, message }` |

**Movement rules**
- Server tick fixed (for example 20 Hz). The client never sends final positions.
- The server rejects moves into non-walkable cells, clamps speed, and ignores messages above the rate limit.
- The client predicts its own avatar and reconciles on mismatch using `seq`. Remote avatars are interpolated with a buffer of about 100 ms.
- Proximity events use hysteresis (enter at 3 m, leave at 4 m).

## 5. HTTP API contract

All endpoints require `Authorization: Bearer <Supabase JWT>`. Bodies and responses are Zod schemas in `packages/shared`. The server derives the workspace from the token's membership, never from a client-supplied workspace for authorization.

| Method and path | Purpose | Response |
|---|---|---|
| `GET /me/day` | "My day": tasks due, meetings, customer follow-ups, each with a reason | `{ items: DayItem[] }` |
| `GET /projects/:id/status` | Milestones, tasks, blockers, owners, latest decisions | `ProjectStatus` |
| `GET /accounts/:id/status` | Deal stage, commitments, recent activity | `AccountStatus` |
| `POST /meetings` | Create a meeting from a transcript (pasted or fixture), run extraction | `{ meetingId, proposedChanges: ProposedChange[] }` |
| `GET /meetings/:id` | Meeting with summary, decisions, transcript | `Meeting` |
| `POST /proposed-changes/:id/approve` | Apply one change in a transaction, write audit row, notify room | `{ ok: true }` |
| `POST /proposed-changes/:id/reject` | Mark rejected, write audit row | `{ ok: true }` |
| `POST /ask` | Ask the office | `AskResult` |

```ts
AskResult = {
  answer: string;
  abstained: boolean;
  sources: { type: "task"|"milestone"|"commitment"|"meeting"|"account"|"project"; id: string; label: string }[];
}
```

## 6. Data model (Postgres)

Every row of workspace data carries `workspace_id`. RLS: a user may read and write only rows of workspaces they belong to; writes that change records go through the server with the service role after authorization checks.

| Table | Key columns |
|---|---|
| `workspaces`, `memberships` | workspace, user, role |
| `accounts` | name, deal_stage, owner_id |
| `contacts` | account_id, name, role |
| `projects` | name, account_id, owner_id |
| `milestones` | project_id, name, target_date, status |
| `tasks` | project_id or account_id, title, owner_id, due_date, status, blocked_reason |
| `commitments` | account_id, text, due_date, linked_task_id, linked_milestone_id |
| `meetings` | room/zone, started_at, transcript, summary, decisions (jsonb) |
| `proposed_changes` | meeting_id, type, target_table, target_id, before (jsonb), after (jsonb), status (pending/approved/rejected), decided_by, decided_at |
| `audit_log` | actor_id, action, table, row_id, before, after, ts |
| `chat_messages` | room, user_id, text, ts |

Every AI-created or AI-changed record keeps `source_meeting_id`.

## 7. Meeting intelligence pipeline

1. **Input:** transcript text (fixture or pasted).
2. **Extraction:** `LlmClient.extractMeeting(transcript, context)` returns:

```ts
ExtractionResult = {
  summary: string;
  decisions: { text: string }[];
  tasks: { title: string; ownerName?: string; dueDate?: string; action: "create" | "update"; matchHint?: string }[];
  commitments: { text: string; accountName: string; dueDate?: string }[];
  milestoneChanges: { projectName: string; milestoneName: string; newTargetDate: string }[];
}
```

3. **Validate** with Zod. On failure, retry once with the error text, then fall back to summary only.
4. **Map to proposed changes:** match entities to existing records by name and context. Low-confidence matches become a change with `target_id = null` flagged "needs review".
5. **Persist** the meeting and `proposed_changes` (status pending).
6. **Approve:** one transaction applies the change, writes `audit_log`, then the server broadcasts `records_changed`.

## 8. Ask the office pipeline

1. Classify the question: `my_day`, `project_status`, `account_status`, `decision_history`, `other`.
2. Run structured queries for the matching class. Semantic search is post-MVP.
3. If the retrieved set is empty or the class is `other`, return `abstained: true` with a fixed message.
4. Otherwise give the LLM only the retrieved records and require JSON `{ answer, sourceIds }`.
5. Validate: every `sourceId` must exist in the retrieved set; otherwise discard the answer and abstain.
6. Return the answer with resolved source labels.

`FixtureLlm` produces deterministic outputs for the demo transcript and demo questions.

## 9. Security rules

- Service role key and LLM key exist only in the server environment.
- The web app uses only the Supabase anon key and user JWT.
- RLS on every workspace table; add tests that a user in workspace A cannot read workspace B.
- Server validates every socket message and HTTP body with Zod; unknown fields are rejected.
- Rate limit chat and movement messages per connection.
- Approval writes happen only in the server, after checking the actor's membership and that the change is still pending.

## 10. Failure behaviour

| Failure | Behaviour |
|---|---|
| LLM unavailable or invalid output | Use fixture or summary-only path; show a visible notice |
| WebSocket drops | Client reconnects with backoff and resyncs state; shows a reconnecting indicator |
| Approval conflict (change no longer pending) | Return a clear error; client refreshes the drawer |
| Unwalkable target | Server ignores it; client keeps the avatar in place |

## 11. Testing strategy

- **Vitest unit tests:** `isWalkable`, `findPath`, `zoneAt`, movement stepping and clamping, Zod schemas, extraction to proposed-change mapping, approval transaction logic, ask-pipeline source validation.
- **Integration tests:** HTTP endpoints against a local or test database; RLS isolation.
- **Playwright e2e:** two browser contexts join, see each other, move, run the demo script through approval, and see the update in the second context.
- **Visual check:** a script that renders the fixed camera and saves a screenshot for comparison with the reference.

## 12. Implementation decisions for M3 to M6 (plan review, 2026-11-01)

These settle the designs that several work packages share (`docs/WORK_PACKAGES.md`), so no lane
re-decides them. Sections 4 and 5 keep the message and endpoint tables; P1-A updates those to match.
Checked against the installed libraries: Colyseus 0.18 (`@colyseus/core` 0.18.24,
`@colyseus/schema` 5.0.42), Zod 4.6, Node 22.

### 12.1 Movement: inputs in, state out

- The client never sends a position. `move_intent` (held keys on world axes, once per client tick
  and once more on release) and `move_target` (a floor click) carry `seq`, which counts the
  client's ticks.
- One function, `stepPlayer(player, input, dt)` in `packages/shared/src/sim`, moves a player. The
  server runs it in a fixed tick (`setSimulationInterval(..., 1000 / TICK_HZ)`, `TICK_HZ = 20`) and
  records `lastSeq`, the seq of the last input it applied. The client runs the same function at the
  same rate for its own avatar (prediction) and renders between ticks.
- Reconciliation without input replay: the client keeps a ring buffer of its predicted position per
  seq. When a snapshot arrives with `lastSeq = k`, the error is the server position minus the
  predicted position at k. Below `SNAP_DISTANCE` (0.3 m) the error is added to the current
  prediction over about 100 ms; above it the avatar snaps to the server position. The simulation is
  deterministic, so the error is normally zero and the correction invisible.
- Remote players are drawn from a snapshot buffer `INTERP_DELAY_MS` (100 ms) behind, interpolating
  position and facing. Pose and activity step with the snapshot. A position jump above
  `SNAP_DISTANCE` between two snapshots (sitting down, standing up) snaps instead of sliding, so the
  cut in `Person` lines up with the move.
- Activities (desk seat, counter) run on the server with the shared `advanceActivity`. While one
  runs, the local avatar is drawn from snapshots, not predicted.
- Colleagues run on the server tick with the shared routine code and the room's reservation set,
  synced as `NpcView` (decision D6).
- `setPatchRate(1000 / TICK_HZ)`. Per connection: at most 30 movement messages a second and 5 chat
  messages per 10 seconds; anything above is dropped and answered with `error rate_limited`.

### 12.2 Rooms

- One `OfficeRoom` per workspace: `define("office", OfficeRoom).filterBy(["workspaceId"])`. The
  `workspaceId` join option is only the matchmaking key. `static onAuth(token, options, context)`
  verifies the token (the SDK sends `client.auth.token`); `onJoin` refuses a join whose option does
  not match the token's workspace.
- An in-process registry (`apps/server/src/room/rooms.ts`: `Map<workspaceId, OfficeRoom>`, set in
  `onCreate`, deleted in `onDispose`) lets the HTTP API broadcast `records_changed` to the right
  room after a commit. One process, so no message bus.
- `JoinOptions.protocol` must equal `PROTOCOL_VERSION` from `packages/shared`; a mismatch is refused
  with `error { code: "protocol_mismatch" }`. This keeps stale clients from confusing a newer server
  during parallel development and after deploys.
- Reconnect: `allowReconnection(client, RECONNECT_SECONDS)`. The client keeps
  `room.reconnectionToken` and calls `client.reconnect(token)` with backoff. The player and their
  reservation survive the window.
- State subscriptions on the client use `getStateCallbacks(room)` from `@colyseus/sdk`; the
  pre-0.16 `state.players.onAdd(...)` form does not exist any more.

### 12.3 Auth

- `AUTH_MODE=dev` (the local default): the web shows a name picker and sends `dev:<name>` both as
  `client.auth.token` and as the HTTP bearer token. `DevAuth` maps it to a seeded user of
  `WORKSPACE_ID`. The server refuses to start with `AUTH_MODE=dev` when `NODE_ENV=production`.
- `AUTH_MODE=supabase`: the web signs in with `@supabase/supabase-js` (seeded test users locally;
  email and password when deployed) and sends the access token the same two ways. The server
  verifies it with `jose`: HS256 with `SUPABASE_JWT_SECRET` for the local CLI, or the project's
  JWKS (`<SUPABASE_URL>/auth/v1/.well-known/jwks.json`) for hosted projects with asymmetric keys.
  The claims give `userId`; a membership lookup (cached for a few seconds) gives `workspaceId` and
  the display name. Authorization never uses a client-supplied workspace.
- Both modes resolve to the same `AuthClaims = { userId; name; workspaceId }`, which every HTTP
  handler and the room pass to the `Repo`.

### 12.4 Database access

- The server talks to Postgres with postgres.js over `DATABASE_URL` (local: from
  `supabase status`; hosted: the Supavisor pooler, with `prepare: false` when it runs in transaction
  mode). Migrations are Supabase CLI files in `supabase/migrations`.
- Policies: members may `SELECT` rows of their workspace. There are no `INSERT`, `UPDATE` or
  `DELETE` policies for `authenticated`, so the browser's anon key plus a user JWT can never write.
  Every write happens in the server.
- The `Repo` wraps each request in a transaction. Reads run as the user: `SET LOCAL ROLE
  authenticated` and `set_config('request.jwt.claims', <claims json>, true)`, so RLS applies to the
  server's own reads (this is also how Supabase recommends testing policies as a user). Writes
  (`createMeeting`, `approveChange`, `rejectChange`, `saveChat`) run under the connection's own
  role, which bypasses RLS, only after an explicit membership check in code; every query still
  names `workspace_id`.
- If the hosted project's role cannot `SET ROLE authenticated`, keep the explicit `workspace_id`
  scoping, prove isolation with supabase-js (anon key plus a user's JWT) instead, and report it.
- `approveChange`: `SELECT ... FOR UPDATE` the proposed change; it must be `pending`; apply it by
  type; insert the `audit_log` row (before and after); mark it approved; commit; then, outside the
  transaction, `bus.recordsChanged`. A change that is no longer pending returns 409.
- Users: `profiles(id = auth.users.id, name)` and `memberships(workspace_id, user_id, role)`. The
  seed creates Maya and Arjun through the Auth Admin API (service role key, local or hosted alike)
  and then writes profiles, memberships and the Acme records with the ids it got back. Shared demo
  data therefore identifies people by `key` (`maya`, `arjun`), never by UUID; records keep stable
  UUIDs.

### 12.5 LLM

- `LlmClient { extractMeeting(transcript, context); answer(question, records) }` returns raw
  output. The pipelines validate with Zod, retry once with the validation error, then fall back
  (summary only; abstain).
- `FixtureLlm` is the default, and the only client in tests and CI. It is deterministic over the
  shared demo data.
- The real adapter uses Anthropic's SDK (`@anthropic-ai/sdk`): `LLM_PROVIDER=anthropic`, model from
  `LLM_MODEL` (default `claude-opus-5-5`), key from `LLM_API_KEY`. Structured output goes through
  `client.messages.parse` with `output_config.format = zodOutputFormat(<the shared Zod schema>)`
  (`@anthropic-ai/sdk/helpers/zod`), followed by the same Zod validation as the fixture path.
  `output_config.effort: "low"` for extraction and answers (thinking stays on; it cannot be
  disabled on this model). `timeout` 30 000 ms (milliseconds in the TypeScript SDK), `maxRetries` 1.
  Optional hardening: `fallbacks: "default"` (beta `server-side-fallback-2026-07-01`) so a safety
  refusal still returns an answer; without it the pipeline's own fallback handles a refusal.
- Never log keys. Prompts and outputs that contain records are logged only at debug level, never
  in production.
- Ask: classify by rules first (the seeded project and account names, "my day"), the LLM only when
  the rules fail. Retrieve with structured queries. The LLM only composes `{ answer, sourceIds }`
  from the retrieved records; every id must be in the retrieved set, or the answer is discarded and
  the office abstains.

### 12.6 Web data layer

- `OfficeApi` (`apps/web/src/api/types.ts`) has two implementations: `mock` (in memory over the
  shared demo data; the default in development and in tests) and `http` (`VITE_API=http`). One
  contract test suite runs against both, so they cannot drift.
- A Zustand `records` store holds what the panels and wall displays show and exposes
  `refetch(kinds)`; the net store calls it on `records_changed`. No query library: the client stack
  is locked to Zustand.
- The office renders before any network. The socket connects in the background; `offline` keeps
  single-player mode with the mock API.

### 12.7 Deployment

- Server: one container (Node 22, pnpm through corepack, `pnpm install --frozen-lockfile`,
  `pnpm --filter @office/server build`, `node apps/server/dist/index.js`), `PORT` from the host,
  `/health` as the health check, on a host that keeps a process and its WebSocket connections alive
  (Fly.io or Render; not serverless). Env: `DATABASE_URL`, `SUPABASE_*`, `AUTH_MODE=supabase`,
  `ALLOWED_ORIGINS`, `LLM_*`.
- Web: the static `apps/web/dist` on Vercel. `VITE_SERVER_URL=https://<server>` (the SDK upgrades
  to WebSocket itself), `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_AUTH_MODE=supabase`,
  `VITE_API=http`, all set at build time.
- Secrets live only in the hosts' settings. `/health` reports `{ ok, version, authMode, llm }` and
  nothing secret, so a rehearsal can confirm what is deployed.

### 12.8 Testing tools

- Room tests: `@colyseus/testing` boots the real server inside Vitest and drives it with the SDK.
- Database tests: against the local Supabase; each test creates its own workspace and cleans up.
- Component tests: Vitest with `// @vitest-environment jsdom` per file, so the node tests stay fast.
- e2e: Playwright with two browser contexts. Its stack runs on its own ports (`WEB_PORT=5190`,
  `PORT=2590`).

### 12.9 Live meetings (Phase 5, optional; decision D9)

- Provider: LiveKit (WebRTC: audio, video, screen share); LiveKit Cloud for the demo. The server
  holds `LIVEKIT_URL`, `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET`; the browser gets the URL with
  each token, so it needs no LiveKit configuration of its own.
- One LiveKit room per meeting-room zone per workspace, named `${workspaceId}--${zoneId}`.
  Presence in the office decides membership: `POST /calls/token { zoneId }` is honoured only when
  the office room's state shows the caller in that zone and the zone is a meeting, customer or
  project room. Tokens (`livekit-server-sdk`) carry the user id as identity, grant join, publish
  and subscribe for that room only, and expire after an hour.
- The browser (`livekit-client`) connects when the avatar enters the zone and disconnects when it
  leaves: microphone on if allowed, listen-only with a notice if denied; camera and screen share
  are toggles. Tiles live in the right drawer; a shared screen is drawn on the room's wall display
  as a `VideoTexture`. The player's status is `in_meeting` during the call.
- Transcript: each browser captions its own speaker with the Web Speech API and sends final
  segments through the office room (`caption_send`); the server assembles the zone's transcript
  with speaker names and, on "End meeting", feeds it to the meetings pipeline exactly as a pasted
  transcript. A speech-to-text provider in a LiveKit agent is the upgrade if the browser route is
  not good enough.
- Failure behaviour: no keys, or LiveKit unreachable, gives "Calls unavailable"; the office, the
  fixture demo and the pasted-transcript route are unaffected. `/health` reports `calls`.
