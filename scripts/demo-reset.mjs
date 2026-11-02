// `pnpm demo:reset` (P4-B task 1): restore the demo in one command.
//
// Local (the default) resets the LOCAL database freely: `supabase db reset`
// (migrations) plus `pnpm db:seed` (Maya, Arjun and the Acme records). It can
// only ever touch this machine's Supabase, never a hosted project.
//
// Hosted (`--target=hosted`) wipes the demo workspace on the LINKED project
// and re-seeds it, and REFUSES unless explicitly approved: `SUPABASE_URL`,
// `DATABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` must all point away from
// localhost (so nothing can silently fall back to local), and
// `DEMO_RESET_CONFIRM` must equal the Supabase host exactly, e.g.
// `DEMO_RESET_CONFIRM=db.example.supabase.co`. The project must already be
// linked (`supabase login` + `supabase link`) with a token that may write.
//
// After either reset the script prints the exact server-restart command:
// rooms hold state in memory (seats, chat, NPCs), so the server must restart
// and the browsers reload; clients then rejoin fresh and refetch records.
// The script never kills processes and never prints secrets (only hosts and
// variable names; connection strings and keys stay out of every message).

import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

/** The frozen demo workspace key: == WORKSPACE_ID in packages/shared/src/index.ts. */
export const DEMO_WORKSPACE_ID = "northwind-demo";

/** The hosted wipe: every workspace table cascades from `workspaces(id)`. */
export const WIPE_SQL = `DELETE FROM public.workspaces WHERE id = '${DEMO_WORKSPACE_ID}';`;

export function isLocalHost(host) {
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

/** The hostname of a URL, or "" when it does not parse (never throws). */
export function hostOf(urlString) {
  try {
    return new URL(urlString).hostname.replace(/^\[|\]$/g, "");
  } catch {
    return "";
  }
}

export function parseArgs(argv) {
  const args = { target: "local", dryRun: false, help: false };
  for (const arg of argv) {
    if (arg === "--target=local" || arg === "--target=hosted") {
      args.target = arg.slice("--target=".length);
    } else if (arg.startsWith("--target=")) {
      throw new Error(`unknown --target (expected --target=local or --target=hosted): ${arg}`);
    } else if (arg === "--dry-run") {
      args.dryRun = true;
    } else if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else {
      throw new Error(`unknown argument: ${arg} (see --help)`);
    }
  }
  return args;
}

function refuse(why) {
  throw new Error(`[demo:reset] refusing the hosted reset: ${why}`);
}

/**
 * The hosted guards (names and hosts only in every message, never values).
 * Returns the confirmed host, or throws the refusal.
 */
export function hostedGuards(env) {
  const supabaseHost = hostOf(env.SUPABASE_URL ?? "");
  if (!supabaseHost) {
    refuse("SUPABASE_URL is missing or not a URL; export the hosted project's URL first.");
  }
  if (isLocalHost(supabaseHost)) {
    refuse(`SUPABASE_URL points at local Supabase (${supabaseHost}); run without --target=hosted for local.`);
  }
  const dbHost = hostOf(env.DATABASE_URL ?? "");
  if (!dbHost) {
    refuse("DATABASE_URL is missing or not a URL; without it the seed would fall back to local.");
  }
  if (isLocalHost(dbHost)) {
    refuse(`DATABASE_URL points at local Supabase (${dbHost}); a hosted reset needs the hosted database.`);
  }
  if (!env.SUPABASE_SERVICE_ROLE_KEY) {
    refuse("SUPABASE_SERVICE_ROLE_KEY is missing; the seed needs it for the hosted project.");
  }
  if ((env.DEMO_RESET_CONFIRM ?? "") !== supabaseHost) {
    refuse(
      `set DEMO_RESET_CONFIRM=${supabaseHost} to confirm wiping the demo workspace on ${supabaseHost}. ` +
        `Without that exact value nothing runs.`,
    );
  }
  return { host: supabaseHost };
}

/** The exact command that restarts the dev server on the current port. */
export function restartHint(env) {
  const port = env.PORT ?? "2567";
  return `PORT=${port} pnpm --filter @office/server dev`;
}

function usage() {
  return [
    "Usage: pnpm demo:reset [--target=local|hosted] [--dry-run]",
    "",
    "  (no flags)       reset the LOCAL database to the seeded demo state",
    "  --target=hosted  wipe + reseed the demo workspace on the LINKED project;",
    "                   needs SUPABASE_URL, DATABASE_URL, SUPABASE_SERVICE_ROLE_KEY",
    "                   (all hosted) and DEMO_RESET_CONFIRM=<supabase host>",
    "  --dry-run        print the steps without running them",
    "",
    "Afterwards, restart the server so rooms drop their state, then reload the",
    "browsers (they rejoin fresh and refetch records). The script never kills",
    "anything; it prints the restart command for you.",
  ].join("\n");
}

function runStep(label, command, args, options) {
  console.log(`[demo:reset] ${label}`);
  const child = spawnSync(command, args, { stdio: "inherit", ...options });
  if ((child.status ?? 1) !== 0) {
    throw new Error(`[demo:reset] step failed (${label}); stopped before the restart hint.`);
  }
}

function main(argv, env) {
  const args = parseArgs(argv);
  if (args.help) {
    console.log(usage());
    return 0;
  }
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const cli = resolve(root, "node_modules", "supabase", "dist", "supabase.js");
  if (!existsSync(cli)) {
    console.error("[demo:reset] the Supabase CLI is missing; run `pnpm install` first.");
    return 1;
  }
  const supabase = (subArgs, extra) =>
    runStep(`supabase ${subArgs.join(" ")}`, process.execPath, [cli, ...subArgs], { cwd: root, ...extra });

  if (args.target === "hosted") {
    const { host } = hostedGuards(env);
    console.log(`[demo:reset] target: hosted project ${host} (confirmed)`);
    if (args.dryRun) {
      console.log(`[demo:reset] would run: supabase db query --linked ${JSON.stringify(WIPE_SQL)}`);
      console.log("[demo:reset] would run: node supabase/seed.mjs");
    } else {
      supabase(["db", "query", "--linked", WIPE_SQL]);
      runStep("node supabase/seed.mjs", process.execPath, [resolve(root, "supabase", "seed.mjs")], {
        cwd: root,
        env,
      });
    }
    console.log(
      args.dryRun
        ? "[demo:reset] dry run only: nothing was touched."
        : "[demo:reset] the hosted demo data is back to the seeded state.",
    );
    console.log("[demo:reset] now restart the DEPLOYED server so rooms drop their state (docs/DEPLOY.md),");
    console.log("[demo:reset] then reload the browsers; they rejoin fresh and refetch records.");
    return 0;
  }

  console.log("[demo:reset] target: local Supabase (this machine only)");
  if (args.dryRun) {
    console.log("[demo:reset] would run: supabase db reset --yes");
    console.log("[demo:reset] would run: node supabase/seed.mjs");
  } else {
    supabase(["db", "reset", "--yes"]);
    runStep("node supabase/seed.mjs", process.execPath, [resolve(root, "supabase", "seed.mjs")], {
      cwd: root,
      env,
    });
  }
  console.log(
    args.dryRun
      ? "[demo:reset] dry run only: nothing was touched."
      : "[demo:reset] local Supabase is back to migrations + seed.",
  );
  console.log("[demo:reset] now restart the server so rooms drop their state, then reload the browsers:");
  console.log(`  ${restartHint(env)}`);
  return 0;
}

const invokedAsMain =
  typeof process.argv[1] === "string" && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedAsMain) {
  try {
    process.exit(main(process.argv.slice(2), process.env));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
