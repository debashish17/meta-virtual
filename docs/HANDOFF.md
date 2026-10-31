# HANDOFF.md

Handoff of the Virtual Office from M2 to the agents who will build M3 to M6, and then to the
reviewer who checks the result. Read `AGENTS.md` first, then this file, then
`docs/IMPLEMENTATION_PLAN.md` and your package in `docs/WORK_PACKAGES.md`.

Baseline: the git tag `handoff-m3` on `main` marks the state handed over. The reviewer compares
the finished work against it.

---

## 1. The project in one minute

A real-time isometric 3D office (React Three Fiber client, Colyseus server, Supabase Postgres)
where a team's meetings update shared customer and project records. An AI proposes the changes and a
person approves each one. Anyone can ask the office "what's the status of Acme?" and get an answer
that cites its sources, or an honest "no record". The demo that must work, end to end, in two
browsers on a public URL, is in `docs/PROJECT_BRIEF.md` section 5.

## 2. What exists today

**Built and working** (M0 to M2, plus the owner's extra requests):

- A 64 x 40 m office on streets, fixed isometric camera that follows you, wheel zoom; GLB furniture
  kit from `blender-asset-pipeline/`, procedural architecture, a city outside the windows.
- You: walk (WASD, arrows, Shift to jog), click to walk (`findPath`), collision with walls, glass and
  furniture, zone pill, look editor (body, clothes, height).
- People: three Mixamo characters with recoloured clothes. Moves: idle, walk, jog, talk, phone,
  counter, sit down, seated, stand up, sit and talk, type. Hands are kept on the desk while typing.
- Colleagues: nine presets with daily routines (type, tea point, chat, phone calls), reserving seats
  and spots so nobody shares one. You can sit at any free desk and type, or make a drink at the counter.
- Tests: 51 shared, 13 web, 2 server (Vitest), 92 pipeline (Python). All pass.

**Not built yet:** the multiplayer room (the server is still the M0 hello room), client networking,
database, auth, LLM, the HTTP API and every product panel. That is this plan.

**Where things are**

| Path | What |
|---|---|
| `packages/shared/src/world/` | `office.ts` (layout: the source of truth for every coordinate), `walk.ts` (`WalkMap`, `findPath`), `index.ts` (`WORLD`, `ZONES`, `FURNITURE`, `OFFICE_WALK`, `zoneAt`) |
| `packages/shared/src/people/` | `look.ts` (looks, the baked bodies and moves manifest) |
| `apps/web/src/office/` | `OfficeScene.tsx` (composition), `Avatar.tsx` (you), `Person.tsx` (one animated person), `Colleagues.tsx` with `routine.ts`, `interactions.ts` (sit, type, counter), `moves.ts`, `deskReach.ts`, `Hud.tsx`, `me.ts` (your name and look), `state.ts` |
| `apps/web/scripts/` | `screenshot.mjs` (headless capture), `people/bake.mjs` (Mixamo to GLB; source files are not in the repo) |
| `apps/server/src/` | `index.ts`, `office.room.ts` (M0 hello room) |
| `docs/screenshots/` | M1 and M2 reference screenshots |

Dev hooks (development builds only): `window.__officeDebug` (`teleport(x, z)`, `walkTo({x, z})`,
`interact()`, `avatar`, `doing`), `window.__officePeople` (every person's pose), `window.__officeReady`.

## 3. Owner decisions (fill in before the phase that needs them)

The defaults and what each decision blocks are in `docs/IMPLEMENTATION_PLAN.md` section 5.

| ID | Decision | Owner's answer |
|---|---|---|
| D1 | G2 approved (movement smooth at 60 fps in your browser) | |
| D2 | Visual freeze for M3 to M6 | |
| D3 | Web host and WebSocket host (accounts created by the owner) | |
| D4 | Local Supabase now; hosted project before Phase 4 | |
| D5 | LLM provider for the real adapter | |
| D6 | Colleagues run on the server (or are removed when online) | |
| D7 | Player contract additions (look, pose, speed, activity) | |
| D8 | Demo sign-in (seeded test users locally, email and password deployed) | |

## 4. Machine and setup

The owner's machine: Windows 11, Git Bash and PowerShell, Node 22.22, pnpm 12.8.1, Python 3.13,
Docker Desktop (needed for local Supabase), Chrome at `C:\Program Files\Google\Chrome\Application\chrome.exe`.
There is no git remote. If one is added it must be **private**: the Mixamo files cannot be
redistributed (`AGENTS.md` section 5).

```bash
pnpm install
pnpm typecheck && pnpm lint && pnpm test
pnpm dev                      # web http://localhost:5173/  server http://localhost:2567/health
```

**Known quirks** (each cost time before)

- In Git Bash, a heredoc that contains quotes can fail with "unexpected EOF". Write multi-line
  scripts to a file and run the file.
- After files move, Vite can keep serving the old module. Restart `pnpm dev`, and confirm with
  `curl http://localhost:5173/src/<file>`.
- A Chrome window driven over DevTools runs at about 1 fps when hidden. Check timing (animations,
  sequences) with a headless script like `apps/web/scripts/screenshot.mjs`, and frame rate in a normal,
  visible browser. Headless Chrome renders in software: its fps is not a GPU benchmark.
- Importing `/src/...` from the page console can give a second copy of a module (Vite adds
  timestamps). Use the dev hooks instead.
- "LF will be replaced by CRLF" warnings from git are harmless.

## 5. How the agents work together

**Roles**

- **Lead** (one agent):
  - builds P1-A and P1-C;
  - assigns packages and creates their branches;
  - reviews each report and checks acceptance;
  - merges into `main`; owns the shared contracts after Gate P1;
  - keeps the status board (section 7) and talks to the owner at gates.
- **Lane agents**: one package at a time, only inside the files that package owns.
- **Reviewer**: after Phase 4, checks everything (section 8). Not one of the builders.

**Branches and worktrees.** Every package gets its own branch and its own git worktree, so agents
never share a working folder:

```bash
git worktree add ../vo-P2-A -b wp/P2-A-room-server main
cd ../vo-P2-A && pnpm install
```

**Ports.** Every agent that runs the app uses its own ports (P1-B makes them configurable):

| Agent slot | `WEB_PORT` | `PORT` (server) | `CHROME_DEBUG_PORT` |
|---|---|---|---|
| lead | 5173 | 2567 | 9341 |
| lane 1 to 7 | 5173 + n | 2567 + n | 9341 + n |

**Local Supabase** is a single instance on this machine. Database tests create their own workspace
rows and clean up after themselves. Only the agent holding P2-C (in Phase 2) or the lead (later)
runs `pnpm db:reset`.

**File ownership.** A package changes only the paths listed under "Owns" in `WORK_PACKAGES.md`.
If you need anything else (another package's file, a shared contract, a new dependency, an entry
file), do not edit it. Add a "Requests" section to your report saying what and why, then carry on
with the rest of your package. The lead makes the change on `main`, and you rebase.

**Dependencies.** P1-B installs every package the plan needs. After Gate P1 nobody else edits
`package.json` or `pnpm-lock.yaml`. A missing dependency is a request to the lead.

**Commits and merging**

- Commit small and often on your branch, with clear messages.
- When done:
  1. Rebase on the current `main`.
  2. Run the checks.
  3. Write `docs/reports/<ID>.md`.
  4. Stop. Lane agents never merge.
- The lead merges with `git merge --no-ff`, runs the checks on `main` after every merge, then tells
  the other lanes to rebase.
- Never force-push or rewrite `main`. Never change or delete a test to make it pass: report it.

**Report** (`docs/reports/<ID>.md`): the `AGENTS.md` section 8 format, plus:
- **Files changed outside "Owns":** should be none.
- **Requests:** contract changes, dependencies, files owned by others.
- **How to verify:** commands to run, URLs to open.

## 6. Run sheet

| Wave | Start when | Packages (one agent each, in parallel) |
|---|---|---|
| 1 | Owner approves D1, D2, D7 | P1-A (lead), P1-B |
| 2 | P1-A merged | P1-C (lead); P1-B continues |
| Gate P1 | P1-A, P1-B, P1-C merged | lead checks, owner informed |
| 3 | Gate P1 | P2-A, P2-B, P2-C, P2-D, P2-E, P2-F, P2-G |
| 4 | Their dependencies merged | P3-A, P3-B, P3-D (P3-D needs D3); P3-C starts against the contract |
| 5 | P3-B, P3-C merged | P3-E; G3, G4 and G5 are reported to the owner |
| 6 | G5 approved, D4 hosted project ready | P4-A, P4-B, then P4-C; G6 |
| 7 | G6 approved | Final review (section 8) |

**With fewer agents**, run these chains instead of one package per agent:

| Agents | Chains |
|---|---|
| 4 | (1) P2-C, P2-D, P2-E, P3-B · (2) P2-A, P3-A, P3-D · (3) P2-B, P2-G, P3-C · (4) P2-F, then P3-E |
| 3 | (1) P2-C, P2-D, P2-E, P3-B · (2) P2-A, P2-B, P3-A, P3-D · (3) P2-F, P2-G, P3-C, P3-E |
| 2 | (1) server side: P2-A, P2-C, P2-D, P2-E, P3-B, P3-D · (2) web side: P2-B, P2-F, P2-G, P3-A, P3-C, P3-E |

**Prompt for the lead** (copy, fill in the path):

> You are the lead agent for the Virtual Office repository at `<repo path>`. Read `AGENTS.md`,
> `docs/HANDOFF.md`, `docs/IMPLEMENTATION_PLAN.md` and `docs/WORK_PACKAGES.md`. Check that the owner's
> decisions in `HANDOFF.md` section 3 are filled in for Phase 1. Then:
> 1. Build P1-A, then P1-C, on their own branches, and run P1-B in parallel through a second agent.
> 2. Keep the status board in `HANDOFF.md` section 7.
> 3. Merge each package after checking its acceptance criteria and report.
> 4. At every gate, stop and report to the owner in the `AGENTS.md` section 8 format.
>
> Never start a phase the owner has not approved. Do not implement other packages yourself:
> hand them to lane agents with the lane prompt in `HANDOFF.md` section 6.

**Prompt for a lane agent** (the lead fills in the angle brackets):

> You are building work package `<ID> <title>` for the Virtual Office repository. Your worktree is
> `<worktree path>`, on branch `<branch>`, created from `main` at `<commit>`. Use `WEB_PORT=<n>`,
> `PORT=<m>`, `CHROME_DEBUG_PORT=<k>`.
>
> Read `AGENTS.md`, `docs/HANDOFF.md` (sections 4 and 5 especially), `docs/IMPLEMENTATION_PLAN.md`
> and the `<ID>` section of `docs/WORK_PACKAGES.md`, then the docs it points to.
>
> Change only the paths your package owns. Anything else goes under "Requests" in your report.
> Write tests first for logic. When every acceptance item is met:
> 1. Rebase on `main`.
> 2. Run `pnpm typecheck`, `pnpm lint` and `pnpm test` (and `pnpm test:e2e` if your package has e2e tests).
> 3. Commit.
> 4. Write `docs/reports/<ID>.md`.
> 5. Stop. Do not merge, and do not start another package.

## 7. Status board (the lead keeps this current)

| Package | Agent | Branch | State | Report |
|---|---|---|---|---|
| P1-A contracts and shared simulation | lead | | not started | |
| P1-B tooling | | | not started | |
| P1-C app skeletons and slots | lead | | not started | |
| P2-A room server | | | not started | |
| P2-B web networking | | | not started | |
| P2-C database | | | not started | |
| P2-D LLM and meetings | | | not started | |
| P2-E ask and status | | | not started | |
| P2-F product panels | | | not started | |
| P2-G wall displays | | | not started | |
| P3-A shared colleagues | | | not started | |
| P3-B HTTP API and auth | | | not started | |
| P3-C web wiring and sign-in | | | not started | |
| P3-D deploy smoke test | | | not started | |
| P3-E demo end to end | | | not started | |
| P4-A production deploy | | | not started | |
| P4-B hardening | | | not started | |
| P4-C rehearsal | | | not started | |

States: not started, in progress, blocked (say why), in review, merged.

## 8. Final review (the owner hands this to the reviewer after G6)

**What the reviewer gets:**
- `main` at the final commit;
- the tag `handoff-m3` (the baseline);
- every `docs/reports/*.md`;
- the status board;
- the deployed URLs;
- the owner's decision table (section 3).

**Prompt for the reviewer:**

> Review the Virtual Office repository at `<repo path>`. The work since the tag `handoff-m3` was
> built by several agents from `docs/IMPLEMENTATION_PLAN.md` and `docs/WORK_PACKAGES.md`. Follow
> the checklist in `docs/HANDOFF.md` section 8. Report each gate and each checklist item as pass, fail
> or not verified, with evidence and the most serious problems first. Do not fix anything unless the
> owner asks.

**Checklist**

1. **Completeness.** Every package on the status board is merged, with a report. Every gate item
   (P1, G3 to G6) is checked, with evidence.
2. **Fresh checks.** In a clean clone or worktree: `pnpm install`, `pnpm typecheck`, `pnpm lint`,
   `pnpm test`, `pnpm test:e2e`, `python blender-asset-pipeline/run.py test`, and `pnpm db:reset`
   followed by the database tests.
3. **Tests not weakened.** Run `git log -p handoff-m3..main` on the test and e2e files. Every
   deleted test or loosened assertion has a reason in a report, and the reason holds up.
4. **Contracts honoured.**
   - Every socket handler and HTTP route parses its input with the shared Zod schemas.
   - No payload types are declared outside `packages/shared`.
   - The client never sends a position.
   - No AI path writes to records except through approved `proposed_changes`.
5. **Security.**
   - Nothing like a key, token or password is committed: `git grep` for `service_role`, `sk-`,
     `eyJ`, `password`, `secret`.
   - `.env` is not tracked.
   - The service role and LLM keys appear only in server code.
   - Every workspace table has RLS (check `pg_tables.rowsecurity`), and the isolation test exists and passes.
   - The server refuses `AUTH_MODE=dev` in production.
   - Rate limits exist and are tested.
6. **AI behaviour.**
   - With `LLM_API_KEY` unset, the whole demo works on `FixtureLlm` and the notice shows.
   - The CEO question abstains.
   - An answer citing an ID outside the retrieved set is discarded (test).
   - Invalid LLM output is retried once, then falls back (test).
7. **The demo.** The `PROJECT_BRIEF.md` section 5 script on the deployed URL in two browsers, by
   hand, plus a reconnect and a reload. `pnpm demo:reset` restores the start.
8. **Scope and decisions.**
   - The locked decisions (`AGENTS.md` section 4) still hold.
   - The visual freeze held: changes to the scene files are limited to slots, remote people,
     colleagues and wall displays.
   - Nothing out of scope (`PROJECT_BRIEF.md` section 7) was added.
9. **Docs.** `README.md` (setup, deploy, known limitations), `AGENTS.md` (commands verified) and
   `ARCHITECTURE.md` (contracts) match the code.
10. **Licence.** The repository is private (or the people assets are excluded from any public
    copy); `apps/web/public/assets/people/LICENSE.txt` is present.

The reviewer's report: one line per gate (pass, fail or not verified), then findings ordered by
severity, each with the file, the evidence and the fix suggested.
