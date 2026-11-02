import type { Page } from "@playwright/test";

// Shared helpers for the P3-E demo spec (`e2e/demo.spec.ts`).
//
// The demo runs against the real stack (the e2e webServer boots the server
// without DATABASE_URL, so the deterministic in-memory repo plus FixtureLlm),
// driven through the product UI in two browser contexts (Maya and Arjun).
//
// Box note (HANDOFF.md section 4): headless SwiftShader on 4 vCPUs is heavily
// contended with two pages rendering. The waits below are schedule bounds for
// that (same precedent as `smoke.spec.ts` / `multiplayer.spec.ts`); the
// assertions after them are unchanged. `waitForFunction` always passes
// `polling: 1000`: the default rAF polling stalls when frames take seconds,
// and the spec freezes rAF outright once movement is done (see `freezeRender`).

/** Frozen demo identifiers from `packages/shared/src/demo/index.ts` (stable UUIDs by design). */
export const DEMO_PROJECT_ID = "ac0e0003-0003-4003-8003-000000000003";
export const DEMO_ACCOUNT_ID = "ac0e0001-0001-4001-8001-000000000001";
export const WEBHOOK_TASK_ID = "ac0e0011-0011-4011-8011-000000000011";

/** The two demo questions (`DEMO_QUESTIONS`): one answered, one abstained. */
export const STATUS_QUESTION = "What's the status of the Acme integration?";
export const CEO_QUESTION = "Who is Acme's CEO?";

export const ABSTAIN_TEXT = "I don't have a record of that.";
export const APPROVED_DATE = "2026-11-22";

/** A walkable aim point inside the Acme room (x 11.5..18.5, z 0..6.5; door at x 15.7). */
const ACME_AIM = { x: 15.7, z: 3.5 };

/** Small viewport: SwiftShader raster cost scales with pixels (P3-C precedent). */
export const DEMO_VIEWPORT = { width: 640, height: 360 };

interface NetPlayer {
  id: string;
  name: string;
  x: number;
  z: number;
}

interface OfficeNetHook {
  status(): string;
  players(): NetPlayer[];
  serverUrl(): string;
}

interface OfficeDebugHook {
  avatar: { x: number; z: number };
  walk: {
    nearestWalkable(point: { x: number; z: number }, radius: number): { x: number; z: number } | null;
    isWalkable(x: number, z: number): boolean;
  };
  walkTo(point: { x: number; z: number }): void;
}

interface WallDisplaysHook {
  open(room: "acme" | "project" | null): void;
}

// NOTE: every page.evaluate callback below is self-contained: Playwright
// serializes the function source, so callbacks cannot call module-scope code.

/** Wait for the scene's ready flag (300 s bound: the second page needs minutes; measured 222 s). */
export async function waitReady(page: Page): Promise<void> {
  await page.waitForFunction(() => (window as unknown as { __officeReady?: boolean }).__officeReady === true, null, {
    timeout: 300_000,
    polling: 1000,
  });
}

/** Wait for the room connection (240 s bound: matchmaking-seat contention; P3-C measured 60 s insufficient). */
export async function waitOnline(page: Page): Promise<void> {
  await page.waitForFunction(() => (window as unknown as { __officeNet?: OfficeNetHook }).__officeNet?.status() === "online", null, {
    timeout: 240_000,
    polling: 1000,
  });
}

/**
 * Stop the render loop: with both pages frozen the main threads are free and
 * every React/fetch/CDP step runs at full speed (P3-C's G5 proof). Only call
 * once a page needs no more frames (movement, camera, pills all stop).
 */
export async function freezeRender(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.requestAnimationFrame = () => 0;
    window.cancelAnimationFrame = () => {};
  });
}

/** Names in the net store: socket-driven, so it works with rendering frozen. */
export async function netPlayerNames(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const hook = (window as unknown as { __officeNet?: OfficeNetHook }).__officeNet;
    if (!hook) throw new Error("__officeNet is not installed");
    return hook.players().map((p) => p.name);
  });
}

/** The HTTP base the page's own api uses (the e2e server URL). */
export async function serverBaseUrl(page: Page): Promise<string> {
  return page.evaluate(() => {
    const hook = (window as unknown as { __officeNet?: OfficeNetHook }).__officeNet;
    if (!hook) throw new Error("__officeNet is not installed");
    return hook.serverUrl();
  });
}

/**
 * Walk to the Acme room through the product's click-to-move path (`walkTo`
 * sends a server-routed `move_target`). The server rejects unwalkable targets,
 * so the aim point is resolved to a walkable one first.
 */
export async function walkToAcmeRoom(page: Page): Promise<{ x: number; z: number }> {
  const target = await page.evaluate((aim: { x: number; z: number }) => {
    const dbg = (window as unknown as { __officeDebug?: OfficeDebugHook }).__officeDebug;
    if (!dbg) throw new Error("__officeDebug is not installed");
    const found = dbg.walk.nearestWalkable(aim, 3);
    if (!found || !dbg.walk.isWalkable(found.x, found.z)) {
      throw new Error("no walkable point near the Acme room");
    }
    dbg.walkTo(found);
    return found;
  }, ACME_AIM);
  return target;
}

/** The right drawer's heading ("My day" or "Approvals (n)"). */
export async function drawerHeading(page: Page): Promise<string> {
  return page.evaluate(() => document.querySelector(".pan-drawer h2")?.textContent ?? "(no drawer heading)");
}

/** Poll the drawer heading until it contains `text` (renders are minutes apart under contention). */
export async function waitDrawerHeading(page: Page, who: string, text: string, timeoutMs = 120_000): Promise<string> {
  const start = Date.now();
  for (;;) {
    const current = await drawerHeading(page);
    if (current.includes(text)) return current;
    if (Date.now() - start > timeoutMs) {
      throw new Error(`${who}'s drawer never showed "${text}" (last: "${current}")`);
    }
    await page.waitForTimeout(2000);
  }
}

/**
 * Ask through the ask panel (input + Ask button). Clicks and fills use `force`:
 * after `freezeRender`, Playwright's rAF-based stability check would hang, and
 * at the small demo viewport the right drawer overlaps the meeting bar.
 */
export async function askQuestion(page: Page, question: string): Promise<void> {
  await page.getByLabel("Your question").fill(question, { force: true, timeout: 60_000 });
  await page.getByRole("button", { name: "Ask" }).click({ force: true, timeout: 60_000 });
}

/** Poll the ask result until its answer contains `text`. */
export async function waitAskAnswer(page: Page, who: string, text: string, timeoutMs = 120_000): Promise<string> {
  await page.waitForFunction(
    (wanted: string) => document.querySelector(".pan-ask-result p")?.textContent?.includes(wanted) === true,
    text,
    { timeout: timeoutMs, polling: 1000 },
  );
  return (await page.locator(".pan-ask-result p").first().textContent()) ?? "";
}

/** Open the Acme wall display's DOM overlay (the same content as the TV texture). */
export async function openAcmeOverlay(page: Page): Promise<string> {
  await page.evaluate(() => {
    const hook = (window as unknown as { __wallDisplays?: WallDisplaysHook }).__wallDisplays;
    if (!hook) throw new Error("__wallDisplays is not installed");
    hook.open("acme");
  });
  const dialog = page.getByRole("dialog");
  await dialog.waitFor({ state: "visible", timeout: 60_000 });
  return (await dialog.textContent()) ?? "";
}
