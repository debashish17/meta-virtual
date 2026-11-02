import { chromium, expect, test, type Browser, type Page } from "@playwright/test";
import { DEMO_VIEWPORT, waitOnline, waitReady, walkToAcmeRoom } from "./helpers/demo";

// P5-B: the call UI against the real stack. No LiveKit Cloud project exists, so
// live media stays honestly OPEN (see the report): what headless CAN prove is
// (1) the off-state UI on the real no-creds path, (2) join/leave/tiles through
// the DEV-only mock room with the token endpoint stubbed, and (3) mic-denied
// listen-only with a real browser-level denial (CDP permissions) on the mock
// room's real getUserMedia path. The token-fetch attempts are observed on the
// wire in every test.
//
// Box note (HANDOFF.md section 4): waits are schedule bounds for the contended
// SwiftShader box; assertions after them are the behaviour. Walk orders flush
// on the frame tick, so these single-page tests never freeze rendering (one
// page is fast enough); clicks use force so a slow frame never hangs them.

test.setTimeout(900_000);

type CallPhase = "idle" | "joining" | "live" | "unavailable";

interface CallsDebugState {
  phase: CallPhase;
  zoneId: string | null;
  notice: string | null;
  listenOnly: boolean;
  micOn: boolean;
  peers: string[];
  screen: string | null;
}

interface CallsDebugHook {
  state(): CallsDebugState;
  useMockRoom(): void;
  addPeer(identity: string, name: string, options?: { camera?: boolean }): void;
  removePeer(identity: string): void;
  peerScreen(identity: string | null): void;
}

interface OfficeDebugHook {
  walk: {
    nearestWalkable(point: { x: number; z: number }, radius: number): { x: number; z: number } | null;
  };
  walkTo(point: { x: number; z: number }): void;
}

interface NetPlayer {
  name: string;
  x: number;
  z: number;
}

function callsState(page: Page): Promise<CallsDebugState> {
  return page.evaluate(() => {
    const hook = (window as unknown as { __callsDebug?: CallsDebugHook }).__callsDebug;
    if (!hook) throw new Error("__callsDebug is not installed");
    return hook.state();
  });
}

async function waitCalls(
  page: Page,
  want: (s: CallsDebugState) => boolean,
  timeoutMs = 180_000,
): Promise<CallsDebugState> {
  await page.waitForFunction(
    (fnSource: string) => {
      const hook = (window as unknown as { __callsDebug?: CallsDebugHook }).__callsDebug;
      if (!hook) return false;
      const wantFn = new Function("s", `return (${fnSource})(s);`) as (
        s: CallsDebugState,
      ) => boolean;
      return wantFn(hook.state());
    },
    want.toString(),
    { timeout: timeoutMs, polling: 1000 },
  );
  return callsState(page);
}

/** Walk somewhere through the product's click-to-move path (server-routed). */
async function walkToPoint(page: Page, aim: { x: number; z: number }): Promise<void> {
  await page.evaluate((target: { x: number; z: number }) => {
    const dbg = (window as unknown as { __officeDebug?: OfficeDebugHook }).__officeDebug;
    if (!dbg) throw new Error("__officeDebug is not installed");
    const found = dbg.walk.nearestWalkable(target, 3);
    if (!found) throw new Error("no walkable point near the target");
    dbg.walkTo(found);
  }, aim);
}

/** The self avatar's server-side position (socket-driven, works frozen). */
async function selfPosition(page: Page, name: string): Promise<{ x: number; z: number }> {
  return page.evaluate((who: string) => {
    const hook = (
      window as unknown as { __officeNet?: { players(): NetPlayer[] } }
    ).__officeNet;
    if (!hook) throw new Error("__officeNet is not installed");
    const self = hook.players().find((p) => p.name === who);
    if (!self) throw new Error(`${who} is not in the net store`);
    return { x: self.x, z: self.z };
  }, name);
}

/** Polls until the self avatar's server-side z passes `z` (the Acme room ends at z 6.5). */
async function waitSelfPastZ(page: Page, name: string, z: number, timeoutMs = 180_000): Promise<void> {
  await page.waitForFunction(
    ({ who, bound }: { who: string; bound: number }) => {
      const hook = (
        window as unknown as { __officeNet?: { players(): NetPlayer[] } }
      ).__officeNet;
      const self = hook?.players().find((p) => p.name === who);
      return self !== undefined && self.z > bound;
    },
    { who: name, bound: z },
    { timeout: timeoutMs, polling: 1000 },
  );
}

/** An open-plan aim point on the main street (z 19.5..22.5), well outside any room. */
const STREET_AIM = { x: 15.7, z: 21 };

async function openOffice(browser: Browser, name: string): Promise<{ page: Page; close(): Promise<void> }> {
  const context = await browser.newContext({ viewport: DEMO_VIEWPORT });
  const page = await context.newPage();
  await page.goto(`/?name=${name}&noao&noshadow`);
  await waitReady(page);
  await waitOnline(page);
  return { page, close: () => context.close() };
}

test("no call service: entering a meeting room shows Calls unavailable and never blocks", async () => {
  // Each test launches its own browser: the three tests need different media
  // flags, and launchOptions cannot be scoped per test through the fixture.
  const browser = await chromium.launch();
  const { page, close } = await openOffice(browser, "Caller");
  try {
    // The join attempt goes on the wire as the avatar enters the room.
    const tokenRequest = page.waitForRequest(
      (req) => req.url().endsWith("/calls/token") && req.method() === "POST",
      { timeout: 240_000 },
    );
    await walkToAcmeRoom(page);
    const req = await tokenRequest;
    expect(req.postDataJSON()).toEqual({ zoneId: "acme_room" });

    // Without P5-A merged this 404s; with P5-A and no LIVEKIT_* it 503s with
    // calls_off. Either way the bar says Calls unavailable and nothing else
    // changes: no crash, no status flip, the avatar keeps walking.
    await expect(page.getByTestId("call-panel")).toBeVisible({ timeout: 120_000 });
    await expect(page.getByText("Calls unavailable")).toBeVisible({ timeout: 120_000 });
    await expect(page.locator("canvas")).toBeVisible();
    await expect(
      page.locator('[aria-label="Participants"] .pan-sub', { hasText: "Available" }),
    ).toBeVisible({ timeout: 120_000 });
    expect((await callsState(page)).phase).toBe("unavailable");

    // Walking out clears the bar; the office is exactly as before.
    await walkToPoint(page, STREET_AIM);
    await waitSelfPastZ(page, "Caller", 10);
    await waitCalls(page, (s) => s.phase === "idle");
    await expect(page.getByTestId("call-panel")).toBeHidden({ timeout: 60_000 });
  } finally {
    await close();
    await browser.close();
  }
});

test.describe("mock call", () => {
  test("join shows the bar and tiles; leave disconnects and re-entry rejoins", async () => {
    const browser = await chromium.launch({
      args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
    });
    const context = await browser.newContext({
      viewport: DEMO_VIEWPORT,
      permissions: ["microphone", "camera"],
    });
    const page = await context.newPage();
    try {
      let tokenCalls = 0;
      await context.route("**/calls/token", (route) => {
        tokenCalls += 1;
        void route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ url: "mock://livekit", token: "mock-token-for-e2e" }),
        });
      });
      await page.goto("/?name=Maya&noao&noshadow");
      await waitReady(page);
      await waitOnline(page);

      // The fake device really grants the microphone here (diagnostic: a
      // failure would join listen-only instead of with the mic on).
      expect(await page.evaluate(() => navigator.permissions.query({ name: "microphone" }).then((p) => p.state))).toBe(
        "granted",
      );

      await page.evaluate(() => {
        const hook = (window as unknown as { __callsDebug?: CallsDebugHook }).__callsDebug;
        if (!hook) throw new Error("__callsDebug is not installed");
        hook.useMockRoom();
      });
      await walkToAcmeRoom(page);
        const joined = await waitCalls(page, (s) => s.phase === "live");
      expect(joined.zoneId).toBe("acme_room");
      expect(joined.micOn).toBe(true);
      expect(tokenCalls).toBe(1);

      const panel = page.getByTestId("call-panel");
      await expect(panel).toBeVisible({ timeout: 120_000 });
      await expect(panel.getByRole("heading", { name: "Acme room", exact: true })).toBeVisible();
      for (const name of ["Mute", "Camera", "Share", "Leave"]) {
        await expect(panel.getByRole("button", { name })).toBeVisible();
      }
      // In-call status reaches the room and echoes back to the people list.
      await page.waitForFunction(
        () =>
          document
            .querySelector('[aria-label="Participants"]')
            ?.textContent?.includes("In a meeting") === true,
        null,
        { timeout: 120_000, polling: 1000 },
      );

      // A remote peer's camera renders as a tile with live video.
      await page.evaluate(() => {
        (window as unknown as { __callsDebug?: CallsDebugHook }).__callsDebug?.addPeer(
          "e2e-arjun",
          "Arjun",
          { camera: true },
        );
      });
      const tile = page.getByTestId("call-tile-e2e-arjun");
      await expect(tile).toBeVisible({ timeout: 60_000 });
      await expect(tile.locator("video")).toBeAttached({ timeout: 60_000 });

      // The camera, mute and share toggles all work from the bar.
      await panel.getByRole("button", { name: "Camera" }).click({ force: true });
      await expect(page.getByTestId("call-tile-self")).toBeVisible({ timeout: 60_000 });
      await panel.getByRole("button", { name: "Camera" }).click({ force: true });
      await expect(page.getByTestId("call-tile-self")).toBeHidden({ timeout: 60_000 });

      await panel.getByRole("button", { name: "Mute" }).click({ force: true });
      await expect(panel.getByRole("button", { name: "Unmute" })).toBeVisible({ timeout: 60_000 });
      await panel.getByRole("button", { name: "Unmute" }).click({ force: true });
      await expect(panel.getByRole("button", { name: "Mute" })).toBeVisible({ timeout: 60_000 });

      await panel.getByRole("button", { name: "Share" }).click({ force: true });
      await expect(page.getByText("Your screen")).toBeVisible({ timeout: 60_000 });
      await panel.getByRole("button", { name: "Share" }).click({ force: true });
      await expect(page.getByText("Your screen")).toBeHidden({ timeout: 60_000 });

      await page.evaluate(() => {
        (window as unknown as { __callsDebug?: CallsDebugHook }).__callsDebug?.removePeer("e2e-arjun");
      });
      await expect(tile).toBeHidden({ timeout: 60_000 });

      // Leave disconnects and suppresses auto-rejoin while still inside.
      await panel.getByRole("button", { name: "Leave" }).click({ force: true });
      await waitCalls(page, (s) => s.phase === "idle");
      await expect(panel).toBeHidden({ timeout: 60_000 });
      const pos = await selfPosition(page, "Maya");
      expect(pos.z).toBeLessThan(6.5);
      await page.waitForTimeout(3000);
      expect(tokenCalls).toBe(1);

      // Out and back in: leaving clears the suppression, re-entry rejoins.
      await walkToPoint(page, STREET_AIM);
      await waitSelfPastZ(page, "Maya", 10);
      await walkToAcmeRoom(page);
      const rejoined = await waitCalls(page, (s) => s.phase === "live");
      expect(rejoined.zoneId).toBe("acme_room");
      expect(tokenCalls).toBe(2);

      // Walking out of a live call disconnects without the button.
      await walkToPoint(page, STREET_AIM);
      await waitSelfPastZ(page, "Maya", 10);
      await waitCalls(page, (s) => s.phase === "idle");
    } finally {
      await context.close();
      await browser.close();
    }
  });
});

test.describe("microphone denied", () => {
  test("listen-only with a notice, never blocked", async () => {
    // A real device with a real prompt path (no fake UI): the CDP denial below
    // is a genuine browser-level permission state.
    const browser = await chromium.launch({ args: ["--use-fake-device-for-media-stream"] });
    const context = await browser.newContext({ viewport: DEMO_VIEWPORT });
    const page = await context.newPage();
    try {
      await context.route("**/calls/token", (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ url: "mock://livekit", token: "mock-token-for-e2e" }),
        }),
      );
      await page.goto("/?name=Maya&noao&noshadow");
      await waitReady(page);
      await waitOnline(page);

      const origin = new URL(page.url()).origin;
      const cdp = await context.newCDPSession(page);
      // The denial needs the context's own id; without it the call succeeds
      // but the page's permission state stays "prompt" (probed 2026-11-02).
      const targets = await cdp.send("Target.getTargets", {});
      const pageTarget = (targets.targetInfos as Array<{ type: string; browserContextId?: string }>).find(
        (t) => t.type === "page",
      );
      await cdp.send("Browser.setPermission", {
        permission: { name: "microphone" },
        setting: "denied",
        origin,
        browserContextId: pageTarget?.browserContextId,
      });
      // The denial is real: the page sees it and getUserMedia rejects.
      expect(await page.evaluate(() => navigator.permissions.query({ name: "microphone" }).then((p) => p.state))).toBe(
        "denied",
      );
      expect(
        await page.evaluate(async () => {
          try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            stream.getTracks().forEach((t) => t.stop());
            return "granted";
          } catch (e) {
            return e instanceof DOMException ? e.name : "rejected";
          }
        }),
      ).not.toBe("granted");

      await page.evaluate(() => {
        const hook = (window as unknown as { __callsDebug?: CallsDebugHook }).__callsDebug;
        if (!hook) throw new Error("__callsDebug is not installed");
        hook.useMockRoom();
      });
      await walkToAcmeRoom(page);
        const joined = await waitCalls(page, (s) => s.phase === "live");
      expect(joined.listenOnly).toBe(true);

      const panel = page.getByTestId("call-panel");
      await expect(panel).toBeVisible({ timeout: 120_000 });
      await expect(
        panel.getByText("Microphone unavailable — you're listening only."),
      ).toBeVisible({ timeout: 120_000 });
      for (const name of ["Unmute", "Camera", "Share", "Leave"]) {
        const button = panel.getByRole("button", { name });
        await expect(button).toBeVisible();
        await expect(button).toBeEnabled();
      }

      // Retrying the microphone is denied again: still in the call, still told
      // (the unit suite proves the retry itself; here the UI must stay put).
      await panel.getByRole("button", { name: "Unmute" }).click({ force: true });
      await page.waitForTimeout(2000);
      const retried = await callsState(page);
      expect(retried.phase).toBe("live");
      expect(retried.listenOnly).toBe(true);
      await expect(
        panel.getByText("Microphone unavailable — you're listening only."),
      ).toBeVisible({ timeout: 60_000 });

      await panel.getByRole("button", { name: "Leave" }).click({ force: true });
      await waitCalls(page, (s) => s.phase === "idle");
    } finally {
      await context.close();
      await browser.close();
    }
  });
});
