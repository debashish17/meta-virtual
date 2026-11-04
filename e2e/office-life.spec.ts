import type { Page } from "@playwright/test";
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
  openAcmeOverlay,
  serverBaseUrl,
  waitAskAnswer,
  waitDrawerHeading,
  waitOnline,
  waitReady,
} from "./helpers/demo";

// P6-E: the office-life story, then the Acme demo. Maya and Arjun check in
// (OfficeLifeBar) and walk to their home desks, seated and typing; Maya books
// the Acme room with Arjun and an agenda (BookingPanel); Arjun gets the
// invite, joins, and walks in; then the demo script runs unchanged from
// "Process meeting" (the same UI steps and assertions as e2e/demo.spec.ts,
// which this spec mirrors but never edits): process, approve three and reject
// one, the live wall receipt and drawer receipt on the second user's views,
// the cited status answer, the abstention, and the reload check.
//
// Every wait below is a schedule bound for the contended SwiftShader box (see
// e2e/helpers/demo.ts); the assertions after them are the story. Rendering is
// never frozen until both people are in the Acme room (status.spec and
// meetings.spec never freeze, and all walks plus the booking UI happen before
// that point); the tail then runs frozen like demo.spec.
//
// The e2e server is shared across specs in one run, so two setup steps keep
// this spec exact anywhere in the order: stale open bookings are ended first
// (meetings.spec leaves none, but an aborted run would 409 the booking), and
// leftover pending changes are rejected before "Process meeting" (meetings'
// agenda test leaves four), so the drawer counts read Approvals (4..0) exactly
// as in demo.spec. Likewise the pre-process wall check asserts the status
// overlay, not the seeded 15 Nov date (demo.spec owns the fresh-state proof).
// The hero receipt line persists across meetings, so it reads the same
// standalone (this spec's own approval) and in a full run (demo.spec's line is
// still there).
test.setTimeout(900_000);

// Home desk seats from `packages/shared/src/people/desks.ts` (team#index
// resolved at load; frozen here the way demo.ts freezes its identifiers).
const MAYA_DESK = { x: 18.5, z: 12.85 };
const ARJUN_DESK = { x: 49.6, z: 12.85 };

const TITLE = "Acme go-live sync";
const AGENDA = "Review the Acme go-live checklist";

/** The hero line: change, source meeting and approver (P6-R). */
const RECEIPT_LINE = "Go-live 15 Nov → 22 Nov · Acme sync · Maya";

interface NetPlayer {
  id: string;
  name: string;
  x: number;
  z: number;
  pose: string;
}

interface OfficeNetHook {
  status(): string;
  players(): NetPlayer[];
}

async function load(page: Page, name: string): Promise<void> {
  await page.setViewportSize(DEMO_VIEWPORT);
  await page.goto(`/?name=${name}&noao&noshadow`);
  await waitReady(page);
  await waitOnline(page);
}

async function pillContains(page: Page, text: string): Promise<void> {
  await page.waitForFunction(
    (wanted: string) => document.querySelector(".office-pill")?.textContent?.includes(wanted) === true,
    text,
    { timeout: 300_000, polling: 1000 },
  );
}

/** A player observed seated and typing at a desk: pose plus position, cross-browser. */
async function waitTypingAt(page: Page, name: string, desk: { x: number; z: number }): Promise<void> {
  await page.waitForFunction(
    (args: { name: string; x: number; z: number }) => {
      const seen = (
        window as unknown as { __officeNet?: OfficeNetHook }
      ).__officeNet
        ?.players()
        .find((p) => p.name === args.name);
      return (
        seen !== undefined &&
        seen.pose === "type" &&
        Math.hypot(seen.x - args.x, seen.z - args.z) < 1.5
      );
    },
    { name, x: desk.x, z: desk.z },
    { timeout: 300_000, polling: 1000 },
  );
}

async function participantsShow(page: Page, text: string): Promise<void> {
  await page.waitForFunction(
    (wanted: string) =>
      document.querySelector(".pan-participants")?.textContent?.includes(wanted) === true,
    text,
    { timeout: 120_000, polling: 1000 },
  );
}

interface BookingLite {
  id: string;
  zoneId: string | null;
  hostId: string;
}

/** GET JSON, failing loud with the status and body (never a downstream TypeError). */
async function getJson(base: string, path: string, auth: Record<string, string>): Promise<unknown> {
  const res = await fetch(`${base}${path}`, { headers: auth });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`GET ${path} -> ${res.status}: ${text.slice(0, 300)}`);
  }
  return JSON.parse(text) as unknown;
}

/** End every open booking, so an aborted run never wedges this one with a 409. */
async function endOpenBookings(base: string, auth: Record<string, string>): Promise<void> {
  const open = (
    (await getJson(base, "/bookings?status=open", auth)) as {
      bookings: BookingLite[];
    }
  ).bookings;
  for (const booking of open) {
    await fetch(`${base}/bookings/${booking.id}/end`, { method: "POST", headers: auth });
  }
}

interface ChangeLite {
  id: string;
}

/** Reject every leftover pending change, so this meeting's drawer counts are exact. */
async function rejectLeftoverPending(base: string, auth: Record<string, string>): Promise<void> {
  const pending = (
    (await getJson(base, "/proposed-changes?status=pending", auth)) as {
      changes: ChangeLite[];
    }
  ).changes;
  for (const change of pending) {
    await fetch(`${base}/proposed-changes/${change.id}/reject`, { method: "POST", headers: auth });
  }
}

/** Entering a room mounts the call panel ("Calls unavailable" with no call
 * service); dismiss it the way a user would before the drawer decisions. */
async function dismissCallPanel(page: Page): Promise<void> {
  await expect(page.getByTestId("call-panel")).toBeVisible({ timeout: 120_000 });
  await page.getByRole("button", { name: "Dismiss" }).click({ timeout: 60_000 });
  await expect(page.getByTestId("call-panel")).toBeHidden({ timeout: 60_000 });
}

test("office life, then the Acme demo", async ({ alice: maya, bob: arjun }) => {
  // 1. Both join; Arjun checks in while Maya loads, so his walk overlaps her load.
  await load(arjun.page, "Arjun");
  await arjun.page.evaluate(() => {
    (window as unknown as { __officeLifeNoReload?: number }).__officeLifeNoReload = 1;
  });
  await arjun.page.getByRole("button", { name: "Check in" }).click({ timeout: 120_000 });
  await load(maya.page, "Maya");
  await maya.page.getByRole("button", { name: "Check in" }).click({ timeout: 120_000 });

  // 2. Both walk to their home desks, seated and typing, each seen by the other.
  await expect(arjun.page.getByRole("button", { name: "Take a break" })).toBeVisible({
    timeout: 120_000,
  });
  await expect(maya.page.getByRole("button", { name: "Take a break" })).toBeVisible({
    timeout: 120_000,
  });
  await pillContains(maya.page, "Customer success");
  await pillContains(arjun.page, "Integrations");
  await waitTypingAt(arjun.page, "Maya", MAYA_DESK);
  await waitTypingAt(maya.page, "Arjun", ARJUN_DESK);
  await participantsShow(maya.page, "Working");
  await participantsShow(arjun.page, "Working");

  // 3. Maya books the Acme room with Arjun and an agenda; she walks in on create.
  const base = await serverBaseUrl(maya.page);
  const auth = { Authorization: "Bearer dev:Maya" };
  await endOpenBookings(base, auth);
  await maya.page.getByRole("button", { name: "Book a room" }).click({ timeout: 120_000 });
  await maya.page.getByLabel("Room", { exact: true }).selectOption("acme_room", { timeout: 120_000 });
  await maya.page.getByLabel("Title", { exact: true }).fill(TITLE, { timeout: 120_000 });
  await maya.page.getByLabel("Agenda", { exact: true }).fill(AGENDA, { timeout: 120_000 });
  await maya.page.getByRole("checkbox", { name: "Arjun" }).check({ timeout: 120_000 });
  await maya.page.getByRole("button", { name: "Book", exact: true }).click({ timeout: 120_000 });
  await pillContains(maya.page, "Acme room");

  // 4. Arjun gets the invite, joins, and walks into the Acme room.
  const invite = arjun.page.locator(".pan-booking-invite", { hasText: "Maya invited you" });
  await expect(invite).toContainText(`${TITLE} in Acme room`, { timeout: 120_000 });
  await invite.getByRole("button", { name: "Join", exact: true }).click({ timeout: 120_000 });
  await pillContains(arjun.page, "Acme room");

  // Both are in the room: the demo script takes over from "Process meeting".
  await maya.page
    .getByRole("button", { name: "Process meeting" })
    .waitFor({ state: "visible", timeout: 480_000 });
  await dismissCallPanel(maya.page);
  await dismissCallPanel(arjun.page);
  await freezeRender(maya.page);
  await freezeRender(arjun.page);
  await expect(maya.page.locator('[data-testid="remote-name"]', { hasText: "Arjun" })).toBeVisible({
    timeout: 240_000,
  });
  await expect(arjun.page.locator('[data-testid="remote-name"]', { hasText: "Maya" })).toBeVisible({
    timeout: 240_000,
  });

  // The Acme wall display shows the status.
  const wallBefore = await openAcmeOverlay(maya.page);
  expect(wallBefore).toContain("Acme Corp");
  expect(wallBefore).toContain("Implementation");
  expect(wallBefore).toContain("Go-live ·");
  await maya.page.keyboard.press("Escape");

  // Leftover pending changes from an earlier spec would shift the drawer
  // counts, so they are decided first; then the meeting is processed through
  // the real button, exactly as in demo.spec.
  await rejectLeftoverPending(base, auth);
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
  // The open booking's agenda travelled with the meeting into the drawer.
  await expect(maya.page.getByRole("heading", { name: "Agenda" })).toBeVisible({
    timeout: 120_000,
  });
  await expect(maya.page.locator(".pan-meeting-agenda")).toContainText(AGENDA, {
    timeout: 120_000,
  });

  // Maya approves three changes and rejects one; both views update live.
  const decisions = [
    { title: "Move milestone date", decision: "Approve", heading: "Approvals (3)" },
    { title: "Update commitment", decision: "Approve", heading: "Approvals (2)" },
    { title: "Reassign task", decision: "Reject", heading: "Approvals (1)" },
    { title: "New task", decision: "Approve", heading: "My day" },
  ] as const;
  for (const [index, step] of decisions.entries()) {
    const card = maya.page.locator(".pan-change", { hasText: step.title });
    const button = card.getByRole("button", { name: step.decision });
    // Idle-sync: a decision disables every card until its refetch lands, but the
    // heading can flip first over the live broadcast — and force:click skips the
    // enabled check, so an unguarded click is silently swallowed by the busy guard.
    await expect(button).toBeEnabled({ timeout: 120_000 });
    await button.click({ force: true, timeout: 60_000 });
    await waitDrawerHeading(maya.page, "maya", step.heading);
    await waitDrawerHeading(arjun.page, "arjun", step.heading);
    if (index === 0) {
      // The drawer receipt reaches the second user live, with no refresh.
      const history = arjun.page.locator('[data-testid="receipt-history"]', { hasText: RECEIPT_LINE });
      await expect(history.first()).toBeVisible({ timeout: 120_000 });
      await expect(
        arjun.page.locator('[data-testid="receipt-history"]', { hasText: "approved by Maya" }).first(),
      ).toBeVisible({ timeout: 120_000 });
    }
  }
  const noReload = await arjun.page.evaluate(
    () => (window as unknown as { __officeLifeNoReload?: number }).__officeLifeNoReload === 1,
  );
  expect(noReload).toBe(true);

  // The second user's Acme wall shows the receipt line, with no refresh; the
  // rejected change never shows as a receipt.
  const wallReceipt = await openAcmeOverlay(arjun.page);
  expect(wallReceipt).toContain(RECEIPT_LINE);
  expect(wallReceipt).not.toContain("rejected by");
  await arjun.page.keyboard.press("Escape");

  // The room is freed for whoever books next.
  await endOpenBookings(base, auth);

  // The status question gets a cited answer reflecting the approvals.
  // (Arjun's drawer is collapsed first: it may overlap the ask panel.)
  await arjun.page
    .locator(".pan-drawer")
    .getByRole("button", { name: "Collapse panel" })
    .click({ force: true, timeout: 60_000 });
  await askQuestion(arjun.page, STATUS_QUESTION);
  const answer = await waitAskAnswer(arjun.page, "arjun", APPROVED_DATE);
  expect(answer).toContain(APPROVED_DATE);
  expect(await arjun.page.locator(".pan-sources li").count()).toBeGreaterThan(0);

  // The CEO question abstains.
  await askQuestion(arjun.page, CEO_QUESTION);
  const abstention = await waitAskAnswer(arjun.page, "arjun", ABSTAIN_TEXT);
  expect(abstention).toContain(ABSTAIN_TEXT);

  // The rejected reassign left its record untouched (the approved ones changed).
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
