import { test, expect } from "./helpers/twoUsers";
import { DEMO_VIEWPORT, waitOnline, waitReady } from "./helpers/demo";

// P6-A: status moves you. Maya checks in and walks to her Customer success desk to
// type while Arjun watches; a break takes her to the tea point and back; four
// colleagues run; nobody else can sit at Maya's desk.
//
// Home desk ids from `packages/shared/src/people/desks.ts` (team#index resolved at
// load; frozen here the way demo.ts freezes its identifiers).
const MAYA_DESK = { id: "seat:18.50,12.85", x: 18.5, z: 12.85 };

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
  lastError(): { code: string; n: number } | null;
}

interface OfficeDebugHook {
  requestSeat(targetId: string): void;
}

interface OfficeNpcsHook {
  (): Array<{ id: string; name: string }>;
}

// Every wait below is a schedule bound for the contended SwiftShader box (see
// e2e/helpers/demo.ts); the assertions after them are the P6-A acceptance.
test.setTimeout(900_000);

async function load(page: import("@playwright/test").Page, name: string): Promise<void> {
  await page.setViewportSize(DEMO_VIEWPORT);
  await page.goto(`/?name=${name}&noao&noshadow`);
  await waitReady(page);
  await waitOnline(page);
}

test("status moves you between desk and break", async ({ alice: maya, bob: arjun }) => {
  await load(maya.page, "Maya");
  await load(arjun.page, "Arjun");

  // Four colleagues, none of them a signed-in person.
  await maya.page.waitForFunction(
    () =>
      (window as unknown as { __officeNpcs?: OfficeNpcsHook }).__officeNpcs?.().length === 4,
    null,
    { timeout: 120_000, polling: 1000 },
  );
  const npcs = await maya.page.evaluate(
    () => (window as unknown as { __officeNpcs?: OfficeNpcsHook }).__officeNpcs?.() ?? [],
  );
  expect(npcs.map((n) => n.name).sort()).toEqual(["Kenji", "Lena", "Omar", "Sofia"]);

  // Check in: Maya walks to her Customer success desk and types, and Arjun sees it.
  await maya.page.getByRole("button", { name: "Check in" }).click({ timeout: 120_000 });
  await expect(maya.page.getByRole("button", { name: "Take a break" })).toBeVisible({
    timeout: 120_000,
  });
  await maya.page.waitForFunction(
    () => document.querySelector(".office-pill")?.textContent?.includes("Customer success") === true,
    null,
    { timeout: 300_000, polling: 1000 },
  );
  await arjun.page.waitForFunction(
    (desk: { x: number; z: number }) => {
      const seen = (
        window as unknown as { __officeNet?: OfficeNetHook }
      ).__officeNet
        ?.players()
        .find((p) => p.name === "Maya");
      return (
        seen !== undefined &&
        seen.pose === "type" &&
        Math.hypot(seen.x - desk.x, seen.z - desk.z) < 1.5
      );
    },
    { x: MAYA_DESK.x, z: MAYA_DESK.z },
    { timeout: 300_000, polling: 1000 },
  );
  await arjun.page.waitForFunction(
    () => document.querySelector(".pan-participants")?.textContent?.includes("Working") === true,
    null,
    { timeout: 120_000, polling: 1000 },
  );

  // Take a break: the tea point, standing with a drink until the next action.
  await maya.page.getByRole("button", { name: "Take a break" }).click({ timeout: 120_000 });
  await expect(maya.page.getByRole("button", { name: "Back to work" })).toBeVisible({
    timeout: 120_000,
  });
  await maya.page.waitForFunction(
    () => document.querySelector(".office-pill")?.textContent?.includes("Tea point") === true,
    null,
    { timeout: 300_000, polling: 1000 },
  );
  await arjun.page.waitForFunction(
    () => document.querySelector(".pan-participants")?.textContent?.includes("On a break") === true,
    null,
    { timeout: 120_000, polling: 1000 },
  );

  // Back to work: home again, seated and typing.
  await maya.page.getByRole("button", { name: "Back to work" }).click({ timeout: 120_000 });
  await expect(maya.page.getByRole("button", { name: "Take a break" })).toBeVisible({
    timeout: 120_000,
  });
  await arjun.page.waitForFunction(
    (desk: { x: number; z: number }) => {
      const seen = (
        window as unknown as { __officeNet?: OfficeNetHook }
      ).__officeNet
        ?.players()
        .find((p) => p.name === "Maya");
      return (
        seen !== undefined &&
        seen.pose === "type" &&
        Math.hypot(seen.x - desk.x, seen.z - desk.z) < 1.5
      );
    },
    { x: MAYA_DESK.x, z: MAYA_DESK.z },
    { timeout: 300_000, polling: 1000 },
  );

  // Nobody else can sit at Maya's desk, even while she is away from it.
  const seenErrors = await arjun.page.evaluate(
    () => (window as unknown as { __officeNet?: OfficeNetHook }).__officeNet?.lastError()?.n ?? 0,
  );
  await arjun.page.evaluate((deskId: string) => {
    const dbg = (window as unknown as { __officeDebug?: OfficeDebugHook }).__officeDebug;
    if (!dbg) throw new Error("__officeDebug is not installed");
    dbg.requestSeat(deskId);
  }, MAYA_DESK.id);
  await arjun.page.waitForFunction(
    (seen: number) => {
      const err = (window as unknown as { __officeNet?: OfficeNetHook }).__officeNet?.lastError();
      return err !== null && err !== undefined && err.n > seen && err.code === "target_taken";
    },
    seenErrors,
    { timeout: 120_000, polling: 1000 },
  );
});
