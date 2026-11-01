import { createRequire } from "node:module";
import { DevAuth, type AuthVerifier } from "./auth/verify.js";
import { createInMemoryRepo, type Repo } from "./db/repo.js";
import type { Env } from "./env.js";
import { StubLlm, type LlmClient } from "./llm/types.js";
import { StubBus, type RoomBus } from "./room/bus.js";
import { InMemoryChatStore, type ChatStore } from "./room/chat.js";

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

export function buildDeps(env: Env): Deps {
  return {
    env,
    version: env.GIT_COMMIT || packageVersion(),
    repo: createInMemoryRepo(),
    // P2-D: FixtureLlm, or the Meta adapter when an LLM key is configured.
    llm: new StubLlm(),
    auth: buildAuth(env),
    // P2-A: broadcast through the room registry.
    bus: new StubBus(),
    chat: new InMemoryChatStore(),
  };
}

function buildAuth(env: Env): AuthVerifier {
  if (env.AUTH_MODE === "dev") {
    return new DevAuth(env.NODE_ENV);
  }
  throw new Error("AUTH_MODE=supabase lands in P3-B; use AUTH_MODE=dev until then");
}
