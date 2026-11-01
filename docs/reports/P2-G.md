Work package / gate: P2-G Wall displays
Status: passed
Done:
- Canvas-texture screens on the Acme room TV (55", x 13.7) and the project room TV (65",
  x 27.5), placed from `packages/shared/src/world/office.ts` + GLB bounds (read-only; no
  furniture moved). Planes sit 15 mm in front of the TV faces, centred.
- Acme screen: deal stage, commitment + due date, next milestone (earliest upcoming).
  Project screen: milestones, blocked tasks with reason + owner, owners with open-task
  counts. Built by `screens.ts`, parsed with the shared `AccountStatus`/`ProjectStatus`
  Zod schemas; data flows from the records store (mock api).
- Redraw only on data change: `screenHash` gates `drawScreen` + `needsUpdate`.
- Click a screen opens a larger DOM overlay with the same content (all lines, close on
  button/backdrop/Escape). The 3D screen is a one-line-per-section glance because a 1.2 m
  TV covers ~70 px at the default walking zoom; the overlay carries full readability.
- Tests: `screens.test.ts` (12) + `DisplayOverlay.test.tsx` (2).
Evidence:
- `pnpm typecheck`: 3/3 pass. `pnpm lint`: 3/3 pass. `pnpm build`: ok.
- `pnpm test`: shared 107/107 pass; web 38/38 pass (14 new P2-G); server files all pass
  (7 files, 0 failures; db tests skip cleanly without Docker) but the runner exits 1 on
  the PRE-EXISTING tinypool teardown crash (`Serialized Error: ERR_INVALID_ARG_TYPE`,
  log /tmp/p2g-server-tests.log) — same crash P2-E/P2-F reported on files this package
  does not own.
- Screenshots (1440x810, headless Chromium + SwiftShader, `?noao&noshadow`, lane ports
  5176/2570): /tmp/p2g-acme.png (Acme room at default zoom), /tmp/p2g-acme-close.png +
  /tmp/p2g-acme-zoom.png (Acme screen reads "Acme Corp / Implementation / Go-live by
  15 Nov / Go-live 15 Nov" at close wheel zoom), /tmp/p2g-project.png +
  /tmp/p2g-project-zoom.png (project screen with amber warn tone), /tmp/p2g-overlay.png
  (overlay opened by a real CDP mouse click on the 3D screen, title verified in DOM).
- Frame rate, honestly: headless Chromium on this GPU-less AWS box renders at ~1 fps in
  software (the screenshot script's own sampler; its output says "not a GPU benchmark").
  The displays add two static canvas textures redrawn only on data change (no per-frame
  cost), so no real-browser frame-rate drop is expected — but a headed real-GPU number
  was impossible here and remains a gap for the lead.
Deviations:
- 3D screen shows a glance (title + first line per section, "+n" overflow marker), the
  overlay shows every line. Same underlying ScreenData; full text cannot fit a 1.2 m TV
  at walking zoom (see frame-rate/methodology note). Reported, not silently reduced: the
  overlay is the readable surface.
- Added a DEV-only `__wallDisplays` hook (same pattern as
  `__officeDebug`/`__panelsDebug`): `.open(room|null)` opens the overlay, `.aim(room)`
  returns the screen centre in client pixels. The click path itself was verified with a
  real CDP mouse click aimed by `.aim` (framing varies run to run, so blind pixel coords
  miss); the hook only aimed, it did not open the overlay.
- No files outside "Owns" changed. Screenshot script needed `--no-sandbox`,
  `--enable-unsafe-swiftshader`, a longer ready wait and early teleport on this box; done
  in /tmp copies (/tmp/screenshot-p2g.mjs, /tmp/p2g-click.mjs), repo script untouched.
Files changed outside "Owns": none.
Requests:
- Lead: copy /tmp/p2g-acme-close.png, /tmp/p2g-project.png, /tmp/p2g-overlay.png to
  docs/screenshots/ (outside Owns).
- Lead: the Vitest server-runner tinypool crash and the screenshot script's sandbox/
  timeout needs on Linux are pre-existing; P2-E/P2-F reported them too.
- Note for P3-C: displays already read through the records store, so the http api needs
  no display changes; `refetch` on `records_changed` will update the canvases.
How to verify:
- `pnpm typecheck && pnpm lint && pnpm test` (server runner crash is pre-existing).
- `WEB_PORT=5176 PORT=2570 pnpm dev`, open http://localhost:5176/, teleport near the
  Acme room (13.7, 2.5) or project room (27.5, 2.5), scroll to zoom in, click a screen.
Open questions: none.
Next: P3-C web wiring (displays update live via the records store); P3-E demo (Acme wall
display shows the status — ready).
