# P6-C Personal notes — checkpoint report

Work package / gate: P6-C Personal notes
Status: passed

## Done

- Store + routes with author-only access:
  - `apps/server/src/notes/store.ts`: in-memory `NoteStore` implemented (was the P6-0 stub). Every call is scoped to the token's workspace and user id; another author's note reads as missing (`NotFoundError`, 404), never forbidden, so its existence does not leak.
  - `apps/server/src/notes/routes.ts`: `GET /notes`, `POST /notes` (201), `PATCH /notes/:id`, `DELETE /notes/:id` mounted on the P6 router (auth + rate limit already ran). Bodies parsed with the shared `NoteCreate` / `NoteUpdate` schemas (400 on failure), ids with `RecordId` (400 on failure). No broadcast: no `records_changed`, no invites (asserted in tests).
  - `apps/server/src/notes/postgres.ts` (new): Postgres store mirroring the P6-B bookings pattern — reads through `PostgresRepo.withUser` (RLS applies), writes through `withService` after a membership check (`UnauthorizedError` for non-members). Every statement names workspace and author.
- Migration `supabase/migrations/20261103000200_notes.sql` (new): `notes` table (`id`, `workspace_id`, `user_id` TEXT per repo convention, `text`, `color`, `done`, `created_at`), author-only SELECT policy, no write policies for `authenticated` (write grants revoked, `GRANT SELECT` only). Applied forward-only to the shared local Supabase (version row recorded, like the CLI would).
- `<NotesPanel />` (`apps/web/src/notes/NotesPanel.tsx` + `notes.css`, new): add (textarea + colour dots + Add), edit (text + colour, Save/Cancel), tick done (checkbox, strikethrough), delete; five sticky-note colours (yellow/pink/green/blue/cream) in the panel palette's cream-and-oak family. Loads from whichever api the build chose, so with `VITE_API=http` notes survive reloads; a failed write keeps the last list with an error notice.
- `apps/web/src/api/notes.ts`: P6-0's version was already a complete mock + http implementation against the shared schemas; no changes needed.
- Tests (all new, next to the code): `store.test.ts` (5), `routes.test.ts` (5, HTTP-level incl. Arjun-cannot-read/change/delete-Maya's-notes, 400s for bad bodies/ids, no-broadcast), `postgres.test.ts` (6 live against local Supabase: CRUD, author isolation, non-member writes refused, RLS raw-read isolation with no author filter in the query, policy-definition check, grants check; skips gracefully with a warning if Supabase or the migration is missing), `NotesPanel.test.tsx` (6, jsdom: empty state, add with colour, add-gating, list + tick/untick, edit + cancel, delete, failed-write keeps list).
- Cut-first: colours KEPT; reordering dropped (was never in Must).

## Evidence

- `pnpm typecheck`: 3/3 pass. `pnpm lint`: 3/3 pass.
- `pnpm test`: shared 142, web 229 (+4 skipped), server 258 (+6 skipped) — all pass, incl. 16 server notes tests (6 live Postgres/RLS) and 6 web notes tests.
- `pnpm test:e2e -- e2e/demo.spec.ts`: 1 passed (2.2 min); `e2e/demo.spec.ts` untouched.
- Live check on lane-4 ports (web 5177, server 2571, `VITE_API=http`): curl-seeded 2 notes as Maya (one ticked done); `GET /notes` as Maya returned 2, as Arjun 0.
- Screenshot `C:/tmp/p6c-notes.png`: Notes tab active, add form with colour dots, yellow + pink (done, struck through) server-backed notes. No visual freeze impact (panel UI only, existing palette family).

## Deviations

- The select policy is `user_id = public.request_user_id()`, not literally `user_id = auth.uid()`: every user reference in the schema is TEXT (core migration convention, so dev-mode ids work), while `auth.uid()` returns uuid — a direct comparison would need a cast and break dev-mode ids. Same author-only semantics, verified by the RLS tests (raw read as Arjun returns only Arjun's rows; policy check asserts the qual contains `request_user_id()` and not `is_workspace_member`).

## Files changed outside "Owns"

- None. `apps/web/src/api/notes.ts` (owned) needed no changes. `deps.ts`, `AuthGate.tsx`, `me.ts`, `e2e/demo.spec.ts` untouched.

## Requests

- Lead: wire the Postgres notes store in `apps/server/src/deps.ts` (not owned by P6-C), mirroring the bookings lines:
  `notes: repo instanceof PostgresRepo ? createPostgresNoteStore(repo) : createInMemoryNoteStore(),`
  plus the `createPostgresNoteStore` import. Until then the server always uses the in-memory notes (notes survive page reloads while the server runs, but not server restarts). The store is implemented and live-tested; only the one-line wiring is missing.
- Lead: apply `supabase/migrations/20261103000200_notes.sql` to the hosted project through the MCP when convenient (already applied to local Supabase only).

## How to verify

- `pnpm typecheck`, `pnpm lint`, `pnpm test`
- `pnpm --filter @office/server test -- src/notes` (16 pass; needs local Supabase for the 6 Postgres tests, else skips with a warning)
- `pnpm --filter @office/web test -- src/notes`
- Dev stack with `VITE_API=http`: open the drawer Notes tab, add/edit/tick/delete; reload keeps them. Second user (switch name) sees none of them.
- Screenshot: `C:/tmp/p6c-notes.png`

## Open questions

- None.

## Next

- P6-E (office-life story) can reference private notes; P6-D's board pins reuse the sticky-note look. Not started.
