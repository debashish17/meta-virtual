// Demo seed entry point (P2-C), run as `pnpm db:seed` (`node supabase/seed.mjs`).
//
// The real seed is TypeScript (`apps/server/src/db/seed.ts`: it imports the
// shared demo data, which plain node cannot load), so this file only launches
// it through the server workspace's tsx. Env: `SUPABASE_URL`,
// `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL` (each falls back to the local
// Supabase CLI) and `SEED_PASSWORD` (local-only default inside seed.ts).
// The same script seeds the hosted project in P4-A.

import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const serverDir = resolve(root, "apps", "server");
const tsxCli = resolve(serverDir, "node_modules", "tsx", "dist", "cli.mjs");
const seedTs = resolve(serverDir, "src", "db", "seed.ts");

if (!existsSync(tsxCli) || !existsSync(seedTs)) {
  console.error("[db:seed] missing tsx or src/db/seed.ts; run `pnpm install` first.");
  process.exit(1);
}

const child = spawnSync(process.execPath, [tsxCli, seedTs, ...process.argv.slice(2)], {
  cwd: serverDir,
  stdio: "inherit",
  env: process.env,
});
process.exit(child.status ?? 1);
