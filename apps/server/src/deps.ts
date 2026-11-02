import { createRequire } from "node:module";
import { fixtureAnswer } from "./ask/index.js";
import { DevAuth, type AuthVerifier } from "./auth/verify.js";
import {
  resolveJwksUrl,
  SupabaseAuth,
  type MembershipLookup,
  type WorkspaceMembership,
} from "./auth/supabase.js";
import { createInMemoryRepo, type Repo } from "./db/repo.js";
import { createPostgresRepo, PostgresRepo } from "./db/postgres.js";
import type { Env } from "./env.js";
import { DatabaseChatStore } from "./http/chatStore.js";
import { createLlm } from "./llm/factory.js";
import type { LlmClient } from "./llm/types.js";
import { RegistryBus, type RoomBus } from "./room/bus.js";
import type { ChatStore } from "./room/chat.js";

/**
 * The server's dependencies, built from env. `createServer`, the room and the HTTP routes all
 * take these, so tests build the same server with the same constructor.
 */
export interface Deps {
  env: Env;
  /** From `GIT_COMMIT`, or the package version when the build did not stamp one. */
  version: string;
  repo: Repo;
  llm: LlmClient;
  auth: AuthVerifier;
  bus: RoomBus;
  chat: ChatStore;
}

function packageVersion(): string {
  try {
    // `../package.json` is the server's own manifest both in `src/` and in `dist/`.
    const require = createRequire(import.meta.url);
    const pkg = require("../package.json") as { version?: unknown };
    return typeof pkg.version === "string" ? pkg.version : "0.0.0";
  } catch {
    return "0.0.0";
  }
}

/**
 * The auth membership lookup over the `Repo`: the first workspace the auth
 * user belongs to (deterministic order), with their profile name. Only the
 * Postgres repo can answer it; without a database there is no membership
 * table, so Supabase mode fails closed there.
 */
async function lookupMembership(repo: Repo, userId: string): Promise<WorkspaceMembership | null> {
  if (!(repo instanceof PostgresRepo)) {
    return null;
  }
  return repo.withService(async (tx) => {
    const rows = await tx`
      SELECT m.workspace_id, COALESCE(p.name, m.user_id) AS name
      FROM memberships m LEFT JOIN profiles p ON p.id::text = m.user_id
      WHERE m.user_id = ${userId}
      ORDER BY m.workspace_id LIMIT 1
    `;
    const row = rows[0];
    if (!row) {
      return null;
    }
    return { workspaceId: String(row["workspace_id"]), name: String(row["name"]) };
  });
}

export function buildDeps(env: Env): Deps {
  // The real repo when a database is configured, otherwise the in-memory one,
  // so a bare checkout keeps working offline in single-player mode.
  const repo = env.DATABASE_URL ? createPostgresRepo(env.DATABASE_URL) : createInMemoryRepo();
  const lookup: MembershipLookup = (userId) => lookupMembership(repo, userId);
  return {
    env,
    version: env.GIT_COMMIT || packageVersion(),
    repo,
    // The Meta adapter when a key is set, otherwise the deterministic fixture
    // answering through P2-E's `fixtureAnswer`.
    llm: createLlm({
      apiKey: env.LLM_API_KEY || undefined,
      baseURL: env.LLM_BASE_URL,
      model: env.LLM_MODEL,
      answer: fixtureAnswer,
    }),
    auth: buildAuth(env, lookup),
    // The live bus: approvals reach the workspace's room (nobody online: no-op).
    bus: new RegistryBus(),
    chat: new DatabaseChatStore(repo, lookup),
  };
}

function buildAuth(env: Env, lookup: MembershipLookup): AuthVerifier {
  if (env.AUTH_MODE === "dev") {
    return new DevAuth(env.NODE_ENV);
  }
  return new SupabaseAuth({ jwksUrl: resolveJwksUrl(env), lookup });
}
