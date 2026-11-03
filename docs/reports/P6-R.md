Work package / gate: P6-R Receipts core (USP A Phase 0)
Status: passed
Done:
- `GET /receipts?accountId=&projectId=&limit=`: one receipt per decided change, newest first, composed from existing `Repo` reads (changes, audit rows, meetings, people, records); no table, no write path, no `db/` edits. Rejected changes return `decision: "rejected"`.
- Approval drawer: a "Decided" history under the pending cards with full receipt lines ("Go-live 15 Nov → 22 Nov · Acme sync · Maya") plus "approved by Maya · 21:04" / "rejected by Maya". History keeps rejections.
- Wall displays (Acme + project rooms): current status plus a "Latest receipts" section (approved only) in the existing canvas texture and DOM overlay; refetched on `records_changed`, so the second user sees it live.
- Ask: sources with a receipt render as chips (record · meeting · approver) that open the receipt detail; meeting sources open the meeting summary. Cite-or-abstain unchanged; CEO question still abstains (pinned by e2e).
- `e2e/receipts.spec.ts`: after Maya approves, Arjun's wall and drawer show the hero line with no refresh; rejection history without wall receipt; record unchanged; abstention. `demo.spec` untouched.
- Cut-first: nothing dropped. Ask chips and the project-room wall are both kept.
Evidence:
- `pnpm typecheck`, `pnpm lint`, `pnpm test` pass (root). Server 215 tests (+13 new: store 8, routes 5); web 215 tests (+12 new: format 6, store 2, screens 3, ask chips 1).
- `npx playwright test receipts`: 1 passed (39 s). `npx playwright test demo`: 1 passed (2.1 min), unchanged file.
- Screenshot: `/tmp/receipts-acme-wall.png` (Acme overlay with "LATEST RECEIPTS — Go-live 15 Nov → 22 Nov · Acme sync · Maya").
- Dev stack used free lane-2 ports (5175/2569/9343); other agents' processes untouched.
Deviations:
- Audit rows carry no change id, so the store matches each decided change to its audit row on (decision, table, before/after), disambiguated by `rowId` and oldest-first. A decided change without its audit row yields no receipt (fail closed, never fabricated).
- Rejected creates have no record: they keep the change id (a stable UUID) as `recordId` with the label from `after`, so drawer history can keep them.
- Decider names resolve via `people`; in-memory dev ids (`dev-<key>`) fall back to the bare key, unknown ids are prettified, never blanked.
- Meeting label is the summary's head before the first colon ("Acme sync: …" → "Acme sync"), truncated, falling back to the zone id.
- Ask chips join receipts client-side by record/meeting id (the ask pipeline is not owned by this package); server `meetingLabel`/`approverName` fields are preferred when present.
Files changed outside "Owns":
- `apps/web/src/office/displays/WallDisplays.tsx` (+9/−3): subscribes to `useReceipts` per wall and passes the lists to the screen builders. No other way to meet acceptance: only that component renders `ScreenData`, and screens/draw alone cannot subscribe. Requesting lead approval.
- `apps/web/src/office/displays/screens.test.ts` (+42): receipt-section tests next to the owned code.
Requests:
- Approve the `WallDisplays.tsx` wiring above (or reassign those lines to whoever owns that file).
- Optional follow-up (not needed for U0): populate `AskSource.meetingLabel/approverName` in the ask pipeline so chips work without the client-side receipts join.
How to verify:
- `pnpm typecheck`, `pnpm lint`, `pnpm test`
- `npx playwright test receipts` then `npx playwright test demo`
- Open `/tmp/receipts-acme-wall.png`
Open questions: none.
Next: P6-B / P6-C lanes unaffected; P6-E can assert the hero line on the deployed URL.
