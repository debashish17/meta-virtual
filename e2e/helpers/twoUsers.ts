import { test as base, type BrowserContext, type Page } from "@playwright/test";

// Two signed-in users as two isolated browser contexts in one test.
// Usage: `import { test, expect } from "./helpers/twoUsers";`
export type UserContext = { context: BrowserContext; page: Page };

async function newUser(
  { browser }: { browser: import("@playwright/test").Browser },
  use: (u: UserContext) => Promise<void>,
) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await use({ context, page });
  await context.close();
}

export const test = base.extend<{ alice: UserContext; bob: UserContext }>({
  alice: async ({ browser }, use) => newUser({ browser }, use),
  bob: async ({ browser }, use) => newUser({ browser }, use),
});

export { expect } from "@playwright/test";
