# Report: P4-B Hardening

```
Work package / gate: P4-B Hardening
Status: passed
Done:
- `pnpm demo:reset` (NEW scripts/demo-reset.mjs + one line in root
  package.json): local path resets the local database freely
  (`supabase db reset --yes` + seed) and prints the exact server-restart
  command (`PORT=<current> pnpm --filter @office/server dev`); hosted path
  (`--target=hosted`) REFUSES unless SUPABASE_URL, DATABASE_URL and
  SUPABASE_SERVICE_ROLE_KEY are all non-local and DEMO_RESET_CONFIRM equals
  the Supabase host exactly, then wipes the demo workspace
  (`DELETE FROM public.workspaces WHERE id` — every workspace table cascades)
  via `supabase db query --linked` and re-seeds. `--dry-run` and `--help`.
  Never kills processes, never prints secrets (hosts/names only). 9 unit
  tests (scripts/demo-reset.test.mjs; run with
  `npx vitest run scripts/demo-reset.test.mjs` — see Requests).
- Performance pass: MEASURED, justified no-change (no renderer edit). The
  three plan items already hold in code: pixel ratio capped (`dpr={[1, 2]}`
  in OfficeScene), shadow cost static (`shadowMap.autoUpdate = false`, 4096
  map redrawn only on frustum steps, verified live `shadowAuto:false`),
  furniture/desktops/sprites instanced and architecture/city merged. Numbers
  (headless Chrome/SwiftShader, this box, 1440x810, mean of 2x5 s rAF
  samples; per-frame totals via autoReset-freeze diff because the composer's
  final fullscreen triangle makes naive renderer.info read 1 call / 1 tri):
  default 0.34 fps / 666 calls / 5.76 M tris; &noao 0.42 fps / 596 calls /
  5.75 M tris; &noshadow 0.38 fps / 650 calls; 640x360 0.79 fps / 554 calls /
  5.55 M tris. Fragment-bound under software rendering; these numbers are
  NOT the real-GPU bar — fps must be measured in a visible browser on a GPU
  box (owner's machine). Changing AO/multisampling/shadow size would trade
  the frozen visuals for unmeasurable gain: no change.
- Notices: exercised all three states live AND fixed a gap. NEW: http-mode
  servers without a key showed no fixture notice (only mock mode had "Demo
  data"); Notices.tsx now reads /health on every fresh online and shows a
  "Fixture AI" pill when `llm` is "fixture" (4 jsdom tests). Live proofs
  (lane stack 5174/2568, in-memory server): "Demo data" stable 60 s in mock
  mode; "Fixture AI" visible at 1440x810 and in DOM; controlled socket drop
  shows "Reconnecting…" then returns online (plus an accidental
  contention stall showing pill composition "Demo data"+"Reconnecting…");
  off-floor move_target shows "target is not walkable", and Dismiss clears
  it with nothing reappearing. Also fixed the stale "until P3-C wires the
  server" tooltip (P3-C is merged).
- README.md rewritten: setup from scratch (verified steps below),
  deployment pointer to docs/DEPLOY.md, honest known limitations (GPU-less
  fps, slow-box e2e bounds, dev-auth DB reads, fixture AI, Mixamo licence).
- NEW docs/DEMO_VIDEO.md: blind-recording runbook (prereqs, 7 scenes with
  beats/lines/timing ~7 min, per-scene reset discipline, fallbacks for
  recording failures incl. single-player mock fallback, and the
  play-the-video fallback for presentation day).
Evidence:
- scripts tests: `npx vitest run scripts/demo-reset.test.mjs` → 9 passed.
- web: 93 passed / 4 skipped (16 files; incl. 4 new Notices tests).
  `pnpm typecheck` 3/3, `pnpm lint` 3/3, `pnpm test` 3/3, `pnpm build` 2/2.
- demo:reset e2e: staged post-demo DB (milestone 22 Nov, 4 tasks, 1 meeting,
  1 change, 1 audit, 1 chat) → `pnpm demo:reset` → milestone 15 Nov
  upcoming, 3 seeded tasks, 0/0/0/0 + restart hint (honours $PORT; dry-run
  prints steps only; `--target=hosted` without env refuses, exit 1).
  Hosted wipe SQL verified locally (DELETE 1 → 0 rows everywhere via
  cascade) + reseed → seeded state (only `--linked` itself untestable here).
  Server restart after an API approval: pending 4→approved→restart→0,
  milestone 22→15 Nov; fresh http client refetches seeded "My day"
  (no stale approvals) + "Fixture AI" pill. Probes/logs: /tmp/p4b-*.mjs,
  /tmp/p4b-*.log, /tmp/p4b-*.png (incl. /tmp/p4b-default.png showing the
  office + Fixture AI pill at 1440x810).
- Notices drills: /tmp/p4b-notices.log (ALL PASSED), /tmp/p4b-dismiss.mjs
  PASS, /tmp/p4b-pillwatch.log (Demo-data stability + stall composition),
  /tmp/p4b-refetch.log PASS.
- Perf: /tmp/p4b-perf.mjs; /tmp/p4b-small.json, /tmp/p4b-mock.json.
- Setup actually followed in this worktree: `pnpm install` (re-ran clean),
  `supabase status` (already running), `pnpm demo:reset` (full run),
  lane `pnpm dev` server+web (http and mock modes), checks + build. NOT
  followed from clean: first-time Docker image pull, `playwright install`
  (browsers pre-installed: chromium-1248 present), fresh clone, Windows
  paths. Chrome on this box: CHROME=<ms-playwright chromium> (the
  screenshot script's default is the Windows path).
Deviations:
- Perf: no renderer change (measured justification above) instead of a
  change; the dev-only &noao/&noshadow switches already present were the
  attribution method.
- demo:reset local path shells `supabase db reset --yes` (+ seed) rather
  than delegating to `pnpm db:reset`, so it never depends on pnpm-in-pnpm;
  `--yes` keeps it non-interactive (local-only, safe).
Files changed outside "Owns": none. Owns (lead-defined): NEW
  scripts/demo-reset.mjs, scripts/demo-reset.test.mjs, the demo:reset line
  in root package.json, apps/web/src/ui/Notices.tsx (+ Notices.test.tsx),
  README.md, NEW docs/DEMO_VIDEO.md, docs/reports/P4-B.md. Deliberately NOT
  touched despite findings: apps/server/src/auth, apps/server/src/db
  (finding 1), apps/web/src/office/* (no perf change needed).
Requests:
1. LEAD: dev-auth + Postgres reads nothing (root-caused, blocks local
   DB-backed rehearsal): DevAuth yields userId `dev-maya`, but
   `memberships` holds only auth UUIDs, so RLS `is_workspace_member` fails
   and every user-scoped read is empty ("unknown account …", empty My day;
   reproduced live: rows exist, API 404s). The schema comment says TEXT ids
   exist "so dev-mode ids work the same way" — but no dev membership rows
   are ever seeded, and my-day ownership would still mismatch. Suggested:
   seed dev-id memberships + ownership mapping, or DevAuth resolving to the
   seeded UUIDs. e2e/demo (in-memory) and deployed (supabase auth) are
   unaffected. README documents it as a known limitation.
2. LEAD: wire `scripts/demo-reset.test.mjs` into `pnpm test` (root has no
   test task covering scripts/; P4-B could only add the demo:reset line).
3. LEAD: `/health` shape `{ ok, version, authMode, llm }` is now read by
   the web (Notices); keep `llm: "fixture" | <provider>` stable or version
   the change.
How to verify:
- `git log --oneline -3` on wp/P4-B-hardening; `git status --short` clean.
- `pnpm typecheck && pnpm lint && pnpm test && pnpm build` from the
  worktree root; `npx vitest run scripts/demo-reset.test.mjs`.
- `node scripts/demo-reset.mjs --help|--dry-run`; hosted refusal:
  `node scripts/demo-reset.mjs --target=hosted` (exit 1, no secrets).
- Local e2e (needs local Supabase): mutate anything, `pnpm demo:reset`,
  restart the server with the printed command, reload → seeded state.
- Notices: `VITE_API=http` + keyless server → "Fixture AI" once online;
  `__officeNet.drop()` → "Reconnecting…" → online; off-floor walkTo →
  error pill → Dismiss clears; mock mode → "Demo data".
- Perf method: /tmp/p4b-perf.mjs (CDP, __officeReady, autoReset-freeze
  totals, 2x5 s fps) — rerun on any box; expect software-rendering fps.
Open questions:
- Who measures the real-GPU fps, and on which machine (owner's browser per
  HANDOFF/G2 precedent)? P4-B's numbers cannot substitute.
- Is the dev-auth DB gap (Request 1) a P4-C fix or accepted (rehearse on
  in-memory/supabase-auth)?
Next: P4-C rehearsal (needs the Request-1 decision); P4-A production deploy
  reuses demo:reset --target=hosted + DEPLOY.md. Not started.
```
