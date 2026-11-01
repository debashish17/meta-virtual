/**
 * The server's environment, parsed at startup (ARCHITECTURE.md 12.7). Every value is optional
 * here so a bare checkout boots with the local defaults; later packages require what they
 * need (the database, Supabase Auth, the real LLM adapter). An empty string counts as unset,
 * so a `.env` copied from `.env.example` behaves like no `.env` at all.
 *
 * A missing or invalid value stops the server with the variable's NAME (never its value).
 * Hand-parsed: `zod` is not a server dependency (it lives in `@office/shared`), and only
 * P1-B edits the lockfile.
 */

export type NodeEnv = "development" | "test" | "production";
export type AuthMode = "dev" | "supabase";

export interface Env {
  NODE_ENV: NodeEnv;
  /** The Colyseus + HTTP port (HANDOFF.md section 5 slots; default 2567). */
  PORT: number;
  /** `dev` is the local default and is refused in production. */
  AUTH_MODE: AuthMode;
  /** CORS origins, comma-separated; empty means any origin (local development). */
  ALLOWED_ORIGINS: string;
  /** postgres.js URL (P2-C). */
  DATABASE_URL: string;
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  SUPABASE_JWKS_URL: string;
  /** Decision D5: Muse Spark through the Meta Model API (P2-D wires the adapter). */
  LLM_PROVIDER: string;
  LLM_BASE_URL: string;
  LLM_API_KEY: string;
  LLM_MODEL: string;
  /** The deployed version; `pnpm build` stamps it, otherwise the package version. */
  GIT_COMMIT: string;
}

const NODE_ENVS: readonly NodeEnv[] = ["development", "test", "production"];
const AUTH_MODES: readonly AuthMode[] = ["dev", "supabase"];

function fail(name: string, why: string): never {
  // The name and the reason only: never the value, which for these variables may be a secret.
  throw new Error(`Invalid server env: ${name} (${why}; see .env.example)`);
}

function text(raw: Record<string, string>, name: string, fallback: string): string {
  return raw[name] ?? fallback;
}

function oneOf<T extends string>(raw: Record<string, string>, name: string, options: readonly T[], fallback: T): T {
  const value = raw[name];
  if (value === undefined) {
    return fallback;
  }
  if ((options as readonly string[]).includes(value)) {
    return value as T;
  }
  return fail(name, `expected one of ${options.join("|")}`);
}

function port(raw: Record<string, string>): number {
  const value = raw["PORT"];
  if (value === undefined) {
    return 2567;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    return fail("PORT", "expected an integer port 1-65535");
  }
  return parsed;
}

function url(raw: Record<string, string>, name: string, fallback: string): string {
  const value = raw[name] ?? fallback;
  try {
    new URL(value);
  } catch {
    return fail(name, "expected a URL");
  }
  return value;
}

function nonEmpty(raw: Record<string, string>, name: string, fallback: string): string {
  const value = raw[name] ?? fallback;
  if (!value) {
    return fail(name, "expected a non-empty value");
  }
  return value;
}

export function loadEnv(from: NodeJS.ProcessEnv = process.env): Env {
  const raw: Record<string, string> = {};
  for (const [key, value] of Object.entries(from)) {
    if (value !== undefined && value !== "") {
      raw[key] = value;
    }
  }
  const env: Env = {
    NODE_ENV: oneOf(raw, "NODE_ENV", NODE_ENVS, "development"),
    PORT: port(raw),
    AUTH_MODE: oneOf(raw, "AUTH_MODE", AUTH_MODES, "dev"),
    ALLOWED_ORIGINS: text(raw, "ALLOWED_ORIGINS", ""),
    DATABASE_URL: text(raw, "DATABASE_URL", ""),
    SUPABASE_URL: text(raw, "SUPABASE_URL", ""),
    SUPABASE_ANON_KEY: text(raw, "SUPABASE_ANON_KEY", ""),
    SUPABASE_SERVICE_ROLE_KEY: text(raw, "SUPABASE_SERVICE_ROLE_KEY", ""),
    SUPABASE_JWKS_URL: text(raw, "SUPABASE_JWKS_URL", ""),
    LLM_PROVIDER: nonEmpty(raw, "LLM_PROVIDER", "meta"),
    LLM_BASE_URL: url(raw, "LLM_BASE_URL", "https://api.meta.ai/v1"),
    LLM_API_KEY: text(raw, "LLM_API_KEY", ""),
    LLM_MODEL: nonEmpty(raw, "LLM_MODEL", "muse-spark-1.3"),
    GIT_COMMIT: text(raw, "GIT_COMMIT", ""),
  };
  if (env.NODE_ENV === "production" && env.AUTH_MODE === "dev") {
    throw new Error("Invalid server env: AUTH_MODE=dev is refused when NODE_ENV=production");
  }
  return env;
}
