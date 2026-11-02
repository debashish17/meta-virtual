import { test, expect } from "./helpers/twoUsers";
import {
  ABSTAIN_TEXT,
  APPROVED_DATE,
  CEO_QUESTION,
  DEMO_ACCOUNT_ID,
  DEMO_PROJECT_ID,
  DEMO_VIEWPORT,
  STATUS_QUESTION,
  WEBHOOK_TASK_ID,
  askQuestion,
  drawerHeading,
  freezeRender,
  netPlayerNames,
  openAcmeOverlay,
  serverBaseUrl,
  waitAskAnswer,
  waitDrawerHeading,
  waitOnline,
  waitReady,
  walkToAcmeRoom,
} from "./helpers/demo";

// P3-E: the PROJECT_BRIEF.md section 5 demo script in two browsers (Maya and
// Arjun) against the local stack with FixtureLlm: both join; the Acme wall
// display shows the status; Maya processes the meeting; she approves three
// changes and rejects one; Arjun's view updates live; the status question gets
// a cited answer; the CEO question abstains. Also: the rejected change left
// its record untouched, and a reload restores state.
//
// Every wait below is a schedule bound for the contended SwiftShader box (see
// e2e/helpers/demo.ts); the assertions after them are the demo script
// unchanged. The demo backend is the deterministic in-memory repo: the e2e
// server boots without DATABASE_URL (playwright.config.ts sets only PORT).
//
// Order matters for speed: Arjun loads first on the quiet box and freezes his
// renderer (he needs no more frames), so Maya then loads and walks with the
// CPU to herself. Measured 295 s end to end on the 4-vCPU box; the 900 s
// budget below is the config default, kept explicit with 3x headroom.
test.setTimeout(900_000);

test("the demo, end to end", async ({ alice: maya, bob: arjun }) => {
  // Small viewports before anything loads: raster cost scales with pixels.
  await maya.page.setViewportSize(DEMO_VIEWPORT);
  await arjun.page.setViewportSize(DEMO_VIEWPORT);

  // 1. Both join, one renderer at a time.
  await arjun.page.goto("/?name=Arjun&noao&noshadow");
  await waitReady(arjun.page);
  await waitOnline(arjun.page);
  await arjun.page.evaluate(() => {
    (window as unknown as { __demoNoReload?: number }).__demoNoReload = 1;
  });
  await freezeRender(arjun.page);

  await maya.page.goto("/?name=Maya&noao&noshadow");
  await waitReady(maya.page);
  await waitOnline(maya.page);
  const target = await walkToAcmeRoom(maya.page);
  expect(target.x).toBeGreaterThanOrEqual(11.5);
  expect(target.x).toBeLessThanOrEqual(18.5);
  expect(await netPlayerNames(maya.page)).toContain("Arjun");
  expect(await netPlayerNames(arjun.page)).toContain("Maya");

  // 2. Maya walks into the Acme room; the wall display shows the status.
  // Bound: her client-side prediction catches up to the server at the frame
  // rate (measured 164 s twice, 158 s once; the server itself walks it in ~15 s).
  await maya.page
    .getByRole("button", { name: "Process meeting" })
    .waitFor({ state: "visible", timeout: 480_000 });
  await freezeRender(maya.page);
  await expect(maya.page.locator('[data-testid="remote-name"]', { hasText: "Arjun" })).toBeVisible({
    timeout: 240_000,
  });
  await expect(arjun.page.locator('[data-testid="remote-name"]', { hasText: "Maya" })).toBeVisible({
    timeout: 240_000,
  });

  const wallBefore = await openAcmeOverlay(maya.page);
  expect(wallBefore).toContain("Acme Corp");
  expect(wallBefore).toContain("Implementation");
  // The seeded 15 Nov state also proves the server started fresh: a reused
  // server would already show the approved 22 Nov.
  expect(wallBefore).toContain("Go-live by 15 Nov");
  expect(wallBefore).toContain("Go-live · 15 Nov");
  await maya.page.keyboard.press("Escape");

  // 3. Maya runs the meeting through the pipeline. The drawer overlaps the
  // MeetingBar at the small demo viewport, so it is collapsed (real UI) for
  // the click and reopened after; the Process click itself is the real button.
  await maya.page
    .locator(".pan-drawer")
    .getByRole("button", { name: "Collapse panel" })
    .click({ force: true, timeout: 60_000 });
  await maya.page.getByRole("button", { name: "Process meeting" }).click({ force: true, timeout: 60_000 });
  await maya.page.getByRole("button", { name: /Open approvals/ }).click({ force: true, timeout: 120_000 });
  await waitDrawerHeading(maya.page, "maya", "Approvals (4)");
  await waitDrawerHeading(arjun.page, "arjun", "Approvals (4)");
  const summary = await maya.page.getByLabel("Meeting summary").textContent();
  expect(summary).toContain("22 Nov");

  // 4 + 5. Maya approves three changes and rejects one; both views update live.
  const decisions = [
    { title: "Move milestone date", decision: "Approve", heading: "Approvals (3)" },
    { title: "Update commitment", decision: "Approve", heading: "Approvals (2)" },
    { title: "Reassign task", decision: "Reject", heading: "Approvals (1)" },
    { title: "New task", decision: "Approve", heading: "My day" },
  ] as const;
  for (const step of decisions) {
    const card = maya.page.locator(".pan-change", { hasText: step.title });
    await card.getByRole("button", { name: step.decision }).click({ force: true, timeout: 60_000 });
    await waitDrawerHeading(maya.page, "maya", step.heading);
    await waitDrawerHeading(arjun.page, "arjun", step.heading);
  }
  const noReload = await arjun.page.evaluate(
    () => (window as unknown as { __demoNoReload?: number }).__demoNoReload === 1,
  );
  expect(noReload).toBe(true);

  // 6. The status question gets a cited answer reflecting the approvals.
  // (Arjun's drawer is collapsed first: it may overlap the ask panel.)
  await arjun.page
    .locator(".pan-drawer")
    .getByRole("button", { name: "Collapse panel" })
    .click({ force: true, timeout: 60_000 });
  await askQuestion(arjun.page, STATUS_QUESTION);
  const answer = await waitAskAnswer(arjun.page, "arjun", APPROVED_DATE);
  expect(answer).toContain(APPROVED_DATE);
  expect(await arjun.page.locator(".pan-sources li").count()).toBeGreaterThan(0);

  // 7. The CEO question abstains.
  await askQuestion(arjun.page, CEO_QUESTION);
  const abstention = await waitAskAnswer(arjun.page, "arjun", ABSTAIN_TEXT);
  expect(abstention).toContain(ABSTAIN_TEXT);

  // The rejected reassign left its record untouched (the approved ones changed).
  const base = await serverBaseUrl(maya.page);
  const projectRes = await fetch(`${base}/projects/${DEMO_PROJECT_ID}/status`, {
    headers: { Authorization: "Bearer dev:Maya" },
  });
  expect(projectRes.status).toBe(200);
  const project = (await projectRes.json()) as {
    milestones: Array<{ name: string; targetDate: string }>;
    tasks: Array<{ id: string; title: string; ownerId: string | null }>;
  };
  expect(project.milestones.find((m) => m.name === "Go-live")?.targetDate).toBe(APPROVED_DATE);
  expect(project.tasks.find((t) => t.id === WEBHOOK_TASK_ID)?.ownerId).toBe("maya");
  expect(project.tasks.some((t) => t.title === "Notify Acme of new date")).toBe(true);
  const accountRes = await fetch(`${base}/accounts/${DEMO_ACCOUNT_ID}/status`, {
    headers: { Authorization: "Bearer dev:Maya" },
  });
  expect(accountRes.status).toBe(200);
  const account = (await accountRes.json()) as { commitments: Array<{ text: string }> };
  expect(account.commitments.some((c) => c.text.includes("22 Nov"))).toBe(true);

  // A reload restores the state from the server.
  await maya.page.reload();
  await waitReady(maya.page);
  await waitOnline(maya.page);
  await freezeRender(maya.page);
  expect(await drawerHeading(maya.page)).toContain("My day");
  const wallAfter = await openAcmeOverlay(maya.page);
  expect(wallAfter).toContain("Go-live · 22 Nov");
  await maya.page.keyboard.press("Escape");
  await maya.page
    .locator(".pan-drawer")
    .getByRole("button", { name: "Collapse panel" })
    .click({ force: true, timeout: 60_000 });
  await askQuestion(maya.page, STATUS_QUESTION);
  const answerAfter = await waitAskAnswer(maya.page, "maya", APPROVED_DATE);
  expect(answerAfter).toContain(APPROVED_DATE);
});
