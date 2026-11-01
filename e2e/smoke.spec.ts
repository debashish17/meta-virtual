import { test, expect } from "./helpers/twoUsers";

// Smoke test: the office loads to a ready scene in two browser contexts at once.
// Pages load one after the other with the dev profiling switches (no AO, no
// shadows): headless software rendering is CPU-bound, and two full-effect pages
// contend so badly the second one takes minutes to reach ready (measured 222 s
// on a 4-vCPU SwiftShader box; the wait below only bounds the schedule, the
// assertions after it are unchanged).
test("office reaches ready in two contexts", async ({ alice, bob }) => {
  for (const user of [alice, bob]) {
    await user.page.goto("/?noao&noshadow");
    await user.page.waitForFunction(
      () => (window as unknown as { __officeReady?: boolean }).__officeReady === true,
      null,
      { timeout: 300_000 },
    );
  }
  await expect(alice.page.locator("canvas")).toBeVisible();
  await expect(bob.page.locator("canvas")).toBeVisible();
});
