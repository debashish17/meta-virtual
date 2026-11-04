// Tests for `pnpm test:e2e` (`scripts/e2e.mjs`): which Playwright runs it makes. Covered by
// `pnpm test` via the root `test:scripts` task. (Never starts Playwright.)
import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FRESH_STATE_SPECS, plan } from "./e2e.mjs";

describe("e2e plan", () => {
  it("runs the shared specs once, ignoring the fresh-state ones, then each of those alone", () => {
    const runs = plan([]);
    expect(runs[0]).toEqual({
      label: "shared stack",
      args: [],
      env: { E2E_IGNORE: FRESH_STATE_SPECS.join(",") },
    });
    expect(runs.slice(1).map((run) => run.args)).toEqual(FRESH_STATE_SPECS.map((spec) => [spec]));
    expect(runs.slice(1).every((run) => Object.keys(run.env).length === 0)).toBe(true);
  });

  it("passes arguments straight to one run, dropping pnpm's leading --", () => {
    expect(plan(["--", "smoke.spec.ts", "--headed"])).toEqual([
      { label: "smoke.spec.ts --headed", args: ["smoke.spec.ts", "--headed"], env: {} },
    ]);
    expect(plan(["status.spec.ts"])).toEqual([
      { label: "status.spec.ts", args: ["status.spec.ts"], env: {} },
    ]);
  });

  it("names specs that exist", () => {
    for (const spec of FRESH_STATE_SPECS) {
      expect(existsSync(new URL(`../e2e/${spec}`, import.meta.url))).toBe(true);
    }
  });
});
