// `pnpm test:e2e`: the Playwright suite, with a fresh stack for each spec that needs the
// seeded Acme records.
//
// The e2e server keeps its records in memory for as long as it runs, so a spec that
// approves the Acme changes moves go-live to 22 Nov for every spec after it. Three specs
// assert the seeded start ("Go-live 15 Nov → 22 Nov"): each gets its own run, and so its
// own freshly booted server. Every other spec shares one run.
//
// `pnpm test:e2e -- <playwright args>` (one spec, `--grep`, `--headed`, ...) passes the
// arguments straight to one Playwright run, as before.
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import net from "node:net";
import { pathToFileURL } from "node:url";

/** The specs that assert the seeded Acme state, each run on a fresh server. */
export const FRESH_STATE_SPECS = ["demo.spec.ts", "office-life.spec.ts", "receipts.spec.ts"];

/** The e2e stack's ports (`playwright.config.ts`). */
export const E2E_PORTS = [5190, 2590];

/**
 * The Playwright runs for these CLI arguments. No arguments: the shared run (the fresh-state
 * specs ignored through `E2E_IGNORE`, read by `playwright.config.ts`), then one run per
 * fresh-state spec. Arguments: exactly one run with them (a leading `--` from pnpm dropped).
 */
export function plan(argv) {
  const args = argv[0] === "--" ? argv.slice(1) : argv;
  if (args.length > 0) {
    return [{ label: args.join(" "), args, env: {} }];
  }
  return [
    { label: "shared stack", args: [], env: { E2E_IGNORE: FRESH_STATE_SPECS.join(",") } },
    ...FRESH_STATE_SPECS.map((spec) => ({ label: spec, args: [spec], env: {} })),
  ];
}

function listening(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: "localhost" });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });
}

/**
 * Waits until the previous run's servers are gone. Playwright reuses a server it finds on
 * its port, so starting while the old one still listens would hand the spec used records.
 */
async function waitPortsFree(timeoutMs = 60_000) {
  const start = Date.now();
  for (;;) {
    const busy = [];
    for (const port of E2E_PORTS) {
      if (await listening(port)) busy.push(port);
    }
    if (busy.length === 0) return;
    if (Date.now() - start > timeoutMs) {
      throw new Error(
        `ports ${busy.join(", ")} still in use: stop that stack first (a fresh-state spec ` +
          "must boot its own server), or run `npx playwright test` to reuse it on purpose",
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

async function main() {
  const require = createRequire(import.meta.url);
  const cli = require.resolve("@playwright/test/cli");
  const runs = plan(process.argv.slice(2));
  const results = [];
  for (const run of runs) {
    if (runs.length > 1) {
      await waitPortsFree();
      console.log(`\n[e2e] ${run.label}`);
    }
    const { status } = spawnSync(process.execPath, [cli, "test", ...run.args], {
      stdio: "inherit",
      env: { ...process.env, ...run.env },
    });
    results.push({ label: run.label, ok: status === 0 });
  }
  if (runs.length > 1) {
    console.log("\n[e2e] summary");
    for (const result of results) {
      console.log(`  ${result.ok ? "passed" : "FAILED"}  ${result.label}`);
    }
  }
  process.exit(results.every((result) => result.ok) ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`[e2e] ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
