import { test, expect } from "./helpers/twoUsers";
import {
  ABSTAIN_TEXT,
  CEO_QUESTION,
  DEMO_PROJECT_ID,
  DEMO_VIEWPORT,
  WEBHOOK_TASK_ID,
  askQuestion,
  drawerHeading,
  freezeRender,
  openAcmeOverlay,
  serverBaseUrl,
  waitAskAnswer,
  waitDrawerHeading,
  waitOnline,
  waitReady,
} from "./helpers/demo";

// P6-R (USP A Phase 0): after Maya approves, Arjun's Acme wall and drawer show the receipt
// without a refresh; a rejection shows in history but never as a receipt and changes
// nothing; the CEO question still abstains. Driven through the HTTP API (no walking), so
// this stays fast on the contended SwiftShader box; the UI assertions are the product UI.
//
// The e2e server is shared across specs in one run: every assertion below targets this
// spec's own meeting (its `meetingId`), so demo.spec's receipts never interfere.
test.setTimeout(900_000);

/** The hero line: change, source meeting and approver. */
const RECEIPT_LINE = "Go-live 15 Nov → 22 Nov · Acme sync · Maya";

interface ChangeLite {
  id: string;
  type: string;
  sourceMeetingId: string;
}

interface ReceiptLite {
  changeId: string;
  kind: string;
  recordLabel: string;
  meetingId: string;
  meetingLabel: string;
  decision: string;
  deciderName: string;
}

test("receipts reach the second user live", async ({ alice: maya, bob: arjun }) => {
  await maya.page.setViewportSize(DEMO_VIEWPORT);
  await arjun.page.setViewportSize(DEMO_VIEWPORT);

  await arjun.page.goto("/?name=Arjun&noao&noshadow");
  await waitReady(arjun.page);
  await waitOnline(arjun.page);
  await arjun.page.evaluate(() => {
    (window as unknown as { __receiptsNoReload?: number }).__receiptsNoReload = 1;
  });
  await freezeRender(arjun.page);

  await maya.page.goto("/?name=Maya&noao&noshadow");
  await waitReady(maya.page);
  await waitOnline(maya.page);
  await freezeRender(maya.page);

  const base = await serverBaseUrl(maya.page);
  const auth = { Authorization: "Bearer dev:Maya" };
  const json = { ...auth, "Content-Type": "application/json" };

  // Maya processes the fixture meeting and approves the milestone move.
  const proc = (await (
    await fetch(`${base}/meetings`, {
      method: "POST",
      headers: json,
      body: JSON.stringify({ zoneId: "acme_room", fixture: "acme-sync" }),
    })
  ).json()) as { meetingId: string };
  expect(typeof proc.meetingId).toBe("string");
  const pending = (
    (await (await fetch(`${base}/proposed-changes?status=pending`, { headers: auth })).json()) as {
      changes: ChangeLite[];
    }
  ).changes.filter((c) => c.sourceMeetingId === proc.meetingId);
  const milestone = pending.find((c) => c.type === "milestone_date");
  const reassign = pending.find((c) => c.type === "task_reassign");
  expect(milestone).toBeDefined();
  expect(reassign).toBeDefined();
  expect(await (await fetch(`${base}/proposed-changes/${milestone!.id}/approve`, { method: "POST", headers: auth })).status).toBe(
    200,
  );

  // The receipts API carries this meeting's approved receipt with Maya named.
  const receipts = (
    (await (await fetch(`${base}/receipts`, { headers: auth })).json()) as {
      receipts: ReceiptLite[];
    }
  ).receipts;
  const mine = receipts.find((r) => r.meetingId === proc.meetingId && r.kind === "milestone_date");
  expect(mine).toBeDefined();
  expect(mine).toMatchObject({
    recordLabel: "Go-live",
    meetingLabel: "Acme sync",
    decision: "approved",
    deciderName: "Maya",
  });

  // Arjun's drawer follows live: one fewer pending, plus the receipt history line.
  const pendingNow = (
    (await (await fetch(`${base}/proposed-changes?status=pending`, { headers: auth })).json()) as {
      changes: ChangeLite[];
    }
  ).changes.length;
  await waitDrawerHeading(arjun.page, "arjun", `Approvals (${pendingNow})`);
  const history = arjun.page.locator('[data-testid="receipt-history"]', { hasText: RECEIPT_LINE });
  await expect(history.first()).toBeVisible({ timeout: 120_000 });
  await expect(
    arjun.page.locator('[data-testid="receipt-history"]', { hasText: "approved by Maya" }).first(),
  ).toBeVisible({ timeout: 120_000 });

  // Arjun's Acme wall shows the receipt line, with no refresh.
  const wall = await openAcmeOverlay(arjun.page);
  expect(wall).toContain(RECEIPT_LINE);
  await arjun.page.keyboard.press("Escape");

  // A rejection lands in history but never as a receipt, and changes nothing.
  expect(await (await fetch(`${base}/proposed-changes/${reassign!.id}/reject`, { method: "POST", headers: auth })).status).toBe(
    200,
  );
  await expect(
    arjun.page.locator('[data-testid="receipt-history"]', { hasText: "rejected by Maya" }).first(),
  ).toBeVisible({ timeout: 120_000 });
  const wallAfterReject = await openAcmeOverlay(arjun.page);
  expect(wallAfterReject).toContain(RECEIPT_LINE);
  expect(wallAfterReject).not.toContain("rejected by");
  await arjun.page.keyboard.press("Escape");

  const rejected = (
    (await (await fetch(`${base}/receipts`, { headers: auth })).json()) as {
      receipts: ReceiptLite[];
    }
  ).receipts.find((r) => r.meetingId === proc.meetingId && r.kind === "task_reassign");
  expect(rejected).toMatchObject({ decision: "rejected", deciderName: "Maya" });

  const project = (await (
    await fetch(`${base}/projects/${DEMO_PROJECT_ID}/status`, { headers: auth })
  ).json()) as { tasks: Array<{ id: string; ownerId: string | null }> };
  expect(project.tasks.find((t) => t.id === WEBHOOK_TASK_ID)?.ownerId).toBe("maya");

  // The CEO question still abstains.
  await arjun.page
    .locator(".pan-drawer")
    .getByRole("button", { name: "Collapse panel" })
    .click({ force: true, timeout: 60_000 });
  await askQuestion(arjun.page, CEO_QUESTION);
  const abstention = await waitAskAnswer(arjun.page, "arjun", ABSTAIN_TEXT);
  expect(abstention).toContain(ABSTAIN_TEXT);

  // Neither page reloaded: everything above arrived live.
  await arjun.page
    .getByRole("button", { name: /Open approvals/ })
    .click({ force: true, timeout: 60_000 });
  expect(await drawerHeading(arjun.page)).toContain("Approvals");
  const noReload = await arjun.page.evaluate(
    () => (window as unknown as { __receiptsNoReload?: number }).__receiptsNoReload === 1,
  );
  expect(noReload).toBe(true);
});
