import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * How the seed and the database tests find Supabase (P2-C). Explicit env wins;
 * anything missing falls back to the local CLI (`supabase status -o env`), so
 * `pnpm db:seed` and the tests work on a bare checkout with local Supabase
 * running. Keys are never printed: failures name the variable, never a value.
 */

export interface LocalSupabase {
  supabaseUrl: string;
  anonKey: string;
  serviceRoleKey: string;
  databaseUrl: string;
}

const MISSING: Record<keyof LocalSupabase, string[]> = {
  supabaseUrl: ["SUPABASE_URL", "API_URL"],
  anonKey: ["SUPABASE_ANON_KEY", "ANON_KEY"],
  serviceRoleKey: ["SUPABASE_SERVICE_ROLE_KEY", "SERVICE_ROLE_KEY"],
  databaseUrl: ["DATABASE_URL", "DB_URL"],
};

function repoRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
}

function cliEnv(): Record<string, string> {
  const root = repoRoot();
  const cli = resolve(root, "node_modules", "supabase", "dist", "supabase.js");
  if (!existsSync(cli)) {
    return {};
  }
  try {
    const out = execFileSync(process.execPath, [cli, "status", "-o", "env"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 60_000,
    });
    const found: Record<string, string> = {};
    for (const line of out.split("\n")) {
      const match = /^([A-Z_]+)="?(.*?)"?\r?$/.exec(line.trim());
      if (match?.[1] && match[2] !== undefined) {
        found[match[1]] = match[2];
      }
    }
    return found;
  } catch {
    return {};
  }
}

export function localSupabase(): LocalSupabase {
  const fromCli = cliEnv();
  const pick = (names: string[]): string => {
    for (const name of names) {
      const value = process.env[name] ?? fromCli[name];
      if (value) {
        return value;
      }
    }
    return "";
  };
  const resolved: LocalSupabase = {
    supabaseUrl: pick(MISSING.supabaseUrl),
    anonKey: pick(MISSING.anonKey),
    serviceRoleKey: pick(MISSING.serviceRoleKey),
    databaseUrl: pick(MISSING.databaseUrl),
  };
  const missing = (Object.keys(resolved) as (keyof LocalSupabase)[]).filter(
    (key) => !resolved[key],
  );
  if (missing.length > 0) {
    const names = missing.flatMap((key) => MISSING[key]).join(", ");
    throw new Error(
      `local Supabase is not configured (missing ${names}): start it with \`pnpm db:start\` or export the variables (see .env.example)`,
    );
  }
  return resolved;
}
