import { test as base, type BrowserContext, type Page } from "@playwright/test";

// Two signed-in users as two isolated browser contexts in one test.
// Usage: `import { test, expect } from "./helpers/twoUsers";`
export type UserContext = { context: BrowserContext; page: Page };

async function newUser(
  { browser }: { browser: import("@playwright/test").Browser },
  use: (u: UserContext) => Promise<void>,
) {
  // Small viewport: 1280x720 pages die under SwiftShader load (smoke browser
  // death at 15.2 m twice); 640x360 runs clean (P3-E measurement). All spec
  // assertions are viewport-independent.
  const context = await browser.newContext({ viewport: { width: 640, height: 360 } });
  const page = await context.newPage();
  await use({ context, page });
  await context.close();
}

export const test = base.extend<{ alice: UserContext; bob: UserContext }>({
  alice: async ({ browser }, use) => newUser({ browser }, use),
  bob: async ({ browser }, use) => newUser({ browser }, use),
});

export { expect } from "@playwright/test";
