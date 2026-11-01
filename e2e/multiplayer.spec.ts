import { test, expect } from "./helpers/twoUsers";

interface NetPlayer {
  id: string;
  userId: string;
  name: string;
  x: number;
  z: number;
  pose: string;
  lastSeq: number;
}

// P2-B: two browsers join the same office, see each other's name pill, and one walks
// while the other watches it move. Pages load one after the other with the dev profiling
// switches (see smoke.spec.ts): headless software rendering is CPU-bound.
test("two browsers see each other move", async ({ alice, bob }) => {
  for (const [user, name] of [
    [alice, "Alice"],
    [bob, "Bob"],
  ] as const) {
    await user.page.goto(`/?name=${name}&noao&noshadow`);
    // 300 s bound: the second page needs minutes under software rendering
    // (measured 222 s on 4 vCPUs); assertions below are unchanged.
    await user.page.waitForFunction(
      () => (window as unknown as { __officeReady?: boolean }).__officeReady === true,
      null,
      { timeout: 300_000 },
    );
  }

  for (const user of [alice, bob]) {
    await user.page.waitForFunction(
      () =>
        (
          window as unknown as {
            __officeNet?: { status(): string };
          }
        ).__officeNet?.status() === "online",
      null,
      { timeout: 60_000 },
    );
  }

  await expect(
    alice.page.locator('[data-testid="remote-name"]', { hasText: "Bob" }),
  ).toBeVisible({ timeout: 30_000 });
  await expect(
    bob.page.locator('[data-testid="remote-name"]', { hasText: "Alice" }),
  ).toBeVisible({ timeout: 30_000 });

  const before = (await bob.page.evaluate(
    () =>
      (
        window as unknown as {
          __officeNet?: { players(): NetPlayer[] };
        }
      ).__officeNet
        ?.players()
        .find((p) => p.name === "Alice") ?? null,
  ))!;
  expect(before).not.toBeNull();

  // Alice walks up-screen (away from the entrance wall) for a moment.
  await alice.page.keyboard.down("ArrowUp");
  await alice.page.waitForTimeout(1500);
  await alice.page.keyboard.up("ArrowUp");

  await bob.page.waitForFunction(
    (prev: NetPlayer) => {
      const seen = (
        window as unknown as {
          __officeNet?: { players(): NetPlayer[] };
        }
      ).__officeNet
        ?.players()
        .find((p) => p.name === "Alice");
      return (
        seen !== undefined && Math.hypot(seen.x - prev.x, seen.z - prev.z) > 0.8
      );
    },
    before,
    { timeout: 30_000 },
  );
});
