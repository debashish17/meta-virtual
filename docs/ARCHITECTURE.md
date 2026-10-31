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
