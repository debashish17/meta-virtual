# P6-A Status moves you, home desks, fewer colleagues

Work package / gate: P6-A Status moves you, home desks, fewer colleagues
Status: passed
Done:
- desks.ts (new): team#index names, HOME_DESKS (maya team_success#0, arjun team_integrations#0, lena/omar/sofia/kenji), teamOf, case-insensitive personKeyForDisplayName, load-time resolve to seat:x,z, NPC_PRESET_IDS/NPC_COUNT=4. 7 tests.
- Reservations: home desks seeded in taken (present or not), guarded delete never frees them, mirrored to synced OfficeState.taken; activity_start on another's home desk gives target_taken with owner bypass; E chip/halo/click never offer another's desk (Avatar takenNow).
- go_to handler: desk walks home/sits/types + working; break walks to nearest free counter spot, makes a drink, stands + on_break; no home desk gives status only + no_home_desk; bad place gives invalid_message; lastSeq never written (P6-0 module-seq caveat honoured); status_set never moves anyone. 6 new room tests.
- OfficeLifeBar: Check in / Take a break / Back to work, top-centre beside zone pill (>=1280px; bottom-dock under 1280px, see Deviations); offline Check in walks locally. Participants show Working / On a break. 5 + 2 tests.
- Colleagues: 4 kept presets at home desks on today's routines; signed-in kept preset skipped, desk stays held. npcs.test.ts rewritten (9 tests).
- e2e/status.spec.ts (new): check-in/type seen by Arjun, break, back-to-work, 4 colleagues, target_taken on Maya's desk.
- Cut-first both dropped per plan: offline shows Check in only; no previous-status restore.
Evidence:
- Builder: typecheck 3/3, lint 3/3; shared 138, web 203 passed + 4 pre-existing skips, server 202 passed + 3 skips; status.spec 1 passed (2.7m); demo.spec 1 passed unchanged (2.2m). Fixed 2 real bugs found in verification (client ignored go_to trips; bar covered drawer tab at 640px). Screenshots C:\tmp\p6a-checkin.png, C:\tmp\p6a-break.png.
- Reviewer: PASS, no must-fix. Re-ran targeted suites green; verified MAYA_DESK freeze via temp probe (removed); confirmed Owns respected and demo.spec/AuthGate/me.ts untouched.
- E2E agent: PASS. Fresh --force typecheck/lint/test green; status.spec 1 passed (2.7m); demo.spec unchanged (git diff empty) 1 passed (2.3m); independently re-drove the flow (NPCS Kenji/Lena/Omar/Sofia, Maya typing at 18.5,12.85, Working/On a break labels). Screenshots C:\tmp\p6a-e2e-checkin.png, C:\tmp\p6a-e2e-break.png (visually inspected).
- Lead: offline Colleagues.tsx aligned to 4 kept presets at home desks (was 9 spread); web suite still 203 + 4 skips; offline overview screenshot C:\tmp\p6a-offline-4npc.png shows Lena/Omar/Sofia/Kenji.
Deviations:
- OfficeLifeBar docks bottom-centre above Ask under 1280px (at 640px it covered the drawer tab and broke demo.spec's force-click); spec placement intact at >=1280px, verified in screenshots.
- Hud.tsx and people/{activity,routine}.ts needed no change (sit offer flows through Avatar takenNow; reservations enforced via the taken set).
- Tests updated for mandated behavior change with reasons in code (npcs.test.ts rewrite; office.room.test.ts nearestSeat skips held home desks).
- Non-kept presets (Priya/Tom/Grace/Ben) signing in get status-only + no_home_desk, per HOME_DESKS scope (maya/arjun + kept presets).
Files changed outside "Owns":
- packages/shared/src/people/index.ts (1-line desks export, required).
- docs/reports/P6-A.md (this report). Lead wiring on main (not in branch): Colleagues.tsx offline alignment, HANDOFF board row.
Requests:
- None open (Colleagues.tsx request handled by lead).
How to verify:
- pnpm typecheck; pnpm lint; pnpm test; pnpm test:e2e status.spec; pnpm test:e2e demo.spec (untouched).
- Two browsers: Maya checks in, types at Customer success desk seen by Arjun; break to tea point; back to work; Arjun cannot take Maya's desk; 4 colleagues.
Open questions:
- None.
Next:
- P6-R, P6-B, P6-C remain (priority in that order); P6-D only if A and B merged and green by ~12:00.
