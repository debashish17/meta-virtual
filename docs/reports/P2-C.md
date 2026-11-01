# P2-C Database — checkpoint report

Work package / gate: P2-C Database (Phase 2)
Status: passed

## Done

- Migrations for every table in `ARCHITECTURE.md` section 6
  (`supabase/migrations/20261101000000_office_core.sql`): `workspace_id` on
  every workspace row, `source_meeting_id` on milestones/tasks/commitments,
  foreign keys, indexes, and enums (`milestone_status`, `task_status`,
  `change_status`, `change_type`), plus the `tasks_exactly_one_parent` check.
- RLS (`supabase/migrations/20261101000001_office_rls.sql`): `profiles` and
  `memberships` first, then one SELECT-for-members policy per workspace table
  via a `SECURITY DEFINER is_workspace_member()` helper; no write policies for
  `authenticated`; the write grants Supabase auto-attaches to new tables are
  revoked as well.
- Seed: `supabase/seed.mjs` (now a launcher) runs the real seed in
  `apps/server/src/db/seed.ts`, which creates Maya and Arjun through the Auth
  Admin API (local-only emails/password, documented, overridable with
  `SEED_PASSWORD`) and upserts the workspace, profiles, memberships and Acme
  records from `@office/shared` demo data with the returned ids. Idempotent;
  P4-A can reuse it for hosted.
- `PostgresRepo` (`apps/server/src/db/postgres.ts`) implementing the P1-C
  `Repo` interface: `withUser` (`SET LOCAL ROLE authenticated` +
  `request.jwt.claims`, every read), `withService` (membership check first,
  `workspace_id` in every statement, each write one transaction),
  `approveChange` (`FOR UPDATE` lock, pending-only, per-type apply, audit row,
  typed `NotPendingError`/`NotFoundError`), `rejectChange` with audit, and
  `prepare: false` auto-detection for transaction-mode poolers. Every row is
  Zod-parsed with the shared schemas on the way out.
- Tests: `postgres.test.ts` (11 tests: `isPoolerUrl` plus 10 database tests,
  each in its own workspace, removed afterwards: isolation via `withUser`,
  RLS on unfiltered reads, no-write as `authenticated`, approve+audit, all
  six change types, double decision, dangling target, reject-unchanged,
  membership checks, scoping) and
  `seed.test.ts` (seeded rows equal the shared demo data with owner keys
  mapped to auth ids; memberships/profiles; idempotency). Both skip cleanly
  when local Supabase is unreachable.
- G4 items for P2-C proven: approving updates records + writes audit rows; the
  RLS test proves workspace isolation (`SET ROLE authenticated` works, so no
  supabase-js fallback was needed).

## Evidence

- `pnpm typecheck`: 3/3 pass. `pnpm lint`: 3/3 pass.
- `pnpm test`: 3/3 pass; server 49 passed + 2 skipped (the two
  "needs local Supabase" placeholders), incl. 13 new P2-C tests (11 postgres +
  2 seed). Full log for the db files: `C:/tmp/p2c-db2.log`.
- `pnpm db:reset` (migrations + real seed) exit 0; after the suite only the
  `northwind-demo` workspace remains with the 3 demo tasks and 13 policies.
- Server boots on `:2581`, `/health` returns `{ok,0.1.0,dev,fixture}`.
- `SET ROLE` proof: unfiltered `SELECT id FROM tasks` as A returns only A's
  row; INSERT/UPDATE/DELETE as `authenticated` are rejected.

## Deviations

- User references (`memberships.user_id`, `owner_id`, `decided_by`,
  `actor_id`) are TEXT, not UUID, and `memberships.user_id` has no FK: the
  shared contract calls them opaque strings, and this keeps dev-mode ids
  working (no UUID casts anywhere; RLS compares `request.jwt.claims ->> 'sub'`
  as text).
- Dates stay TEXT (`YYYY-MM-DD`) so rows map 1:1 onto the shared Zod schemas.
- `seed.mjs` launches `src/db/seed.ts` through the server workspace's tsx:
  plain node cannot import the TypeScript `@office/shared` demo data, and the
  `pnpm db:seed` script itself is P1-B-owned.
- New helper `src/db/local.ts`: env first, `supabase status -o env` fallback,
  so seed and tests work on a bare checkout. Keys are never printed.
- `asJson` helper: postgres.js JSON-encodes a pre-stringified value a second
  time (verified by probe), so jsonb params go through `tx.json`.
- Built uncommitted in the shared checkout on `main`, per instructions (no
  worktree/branch); nothing committed.

## Files changed outside "Owns"

None. Created/edited only `supabase/**`, `apps/server/src/db/**`, and this
report. The checkout holds other uncommitted packages; P2-C's files are:
`supabase/migrations/20261101000000_office_core.sql`,
`supabase/migrations/20261101000001_office_rls.sql`, `supabase/seed.mjs`,
`apps/server/src/db/{local,postgres,seed}.ts`,
`apps/server/src/db/{postgres,seed}.test.ts`.

## Requests

- P3-B: wire `createPostgresRepo(DATABASE_URL)` into `apps/server/src/deps.ts`
  (P1-C-owned; P2-C deliberately left `InMemoryRepo` wired) and add
  `DATABASE_URL` to the turbo dev env allowlist if missing.
- Lead: seed convention to approve — users `maya@northwind.local` /
  `arjun@northwind.local`, default password `northwind-local-dev-only`
  (`SEED_PASSWORD` overrides; P4-A sets a hosted value).

## How to verify

- `pnpm db:start`, then `pnpm db:reset` (migrations + seed, users created).
- `pnpm --filter @office/server test` — one command incl. the database tests
  (they skip with a warning if Supabase is down).
- `pnpm typecheck`, `pnpm lint`, `pnpm test`.

## Open questions

None. D4 (hosted project) is not needed until P4-A; the seed already supports
it via env.

## Next

P3-B (HTTP API + auth) is unblocked on the database side; P2-D/P2-E can read
through `PostgresRepo`. Not started.

## Review (2026-11-01, reviewer addendum)

Re-verified fresh in this session against live local Supabase: `pnpm
typecheck --force` 3/3, `pnpm lint --force` 3/3, `pnpm test --force`
(shared 107, server 49 + 2 skipped, web 24), `pnpm db:seed` exit 0
(idempotent re-run). Independent probe (`C:/tmp/p2c-review-probe.mjs`):
13 tables, 13 policies, RLS on all 13, only `northwind-demo` (2 members)
remains, Maya's unfiltered `SELECT` sees exactly her 3 tasks, a non-member
sees 0 rows, and INSERT/UPDATE/DELETE as `authenticated` are all rejected.
Both G4 items for P2-C hold; e2e is not applicable (P2-C owns none).

Reviewer fixes (minimal, in P2-C-owned files): the `approveChange` /
`rejectChange` status UPDATEs now also name `workspace_id` per ARCH 12.4
("every query still names `workspace_id`"); corrected the test count above
(10 -> 11: `isPoolerUrl` plus 10 database tests). Db tests re-run green
after the fix. Nothing committed.
