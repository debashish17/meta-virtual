import { afterAll, afterEach, describe, expect, it } from "vitest";
import type { Server } from "@colyseus/core";
import { buildDeps } from "./deps.js";
import { loadEnv } from "./env.js";
import { createServer } from "./server.js";

// `Server.listen()` dynamically imports `@pm2/io` when it resolves (Stats.reset), and the
// import spams the worker's IPC channel with `axm:` messages, which breaks vitest's forks
// pool. Plain node is unaffected (no channel: it degrades silently). Swallow only those
// messages for this file; everything else still reaches the pool.
const realSend = process.send?.bind(process);
const filteredSend = function (
  this: unknown,
  message: unknown,
  ...rest: never[]
): boolean {
  if (
    message !== null &&
    typeof message === "object" &&
    "type" in message &&
    typeof message.type === "string" &&
    message.type.startsWith("axm:")
  ) {
    return false;
  }
  return realSend?.(message as never, ...(rest as never[])) ?? false;
} as typeof process.send;
process.send = filteredSend;
afterAll(() => {
  process.send = realSend;
});

async function boot(env: Parameters<typeof loadEnv>[0] = {}): Promise<{ gameServer: Server; base: string }> {
  const gameServer = createServer(buildDeps(loadEnv(env)));
  await gameServer.listen(0);
  const transport = gameServer.transport as unknown as {
    server?: { address(): { port: number } | string | null };
  };
  const address = transport.server?.address();
  if (!address || typeof address === "string") {
    throw new Error("the test server has no port");
  }
  return { gameServer, base: `http://127.0.0.1:${address.port}` };
}

const servers: Server[] = [];
afterEach(async () => {
  while (servers.length > 0) {
    await servers.pop()?.gracefullyShutdown(false);
  }
});

describe("createServer", () => {
  it("boots and answers /health with the deployed configuration", async () => {
    const { gameServer, base } = await boot();
    servers.push(gameServer);
    const res = await fetch(`${base}/health`);
    expect(res.status).toBe(200);
    const health = (await res.json()) as Record<string, unknown>;
    expect(health["ok"]).toBe(true);
    expect(typeof health["version"]).toBe("string");
    expect(health["authMode"]).toBe("dev");
    expect(health["llm"]).toBe("fixture");
  });

  it("reports the configured version and LLM provider", async () => {
    const { gameServer, base } = await boot({
      GIT_COMMIT: "abc123",
      LLM_API_KEY: "not-a-real-key",
      LLM_PROVIDER: "meta",
    });
    servers.push(gameServer);
    const health = (await (await fetch(`${base}/health`)).json()) as Record<string, unknown>;
    expect(health["version"]).toBe("abc123");
    expect(health["llm"]).toBe("meta");
  });
});
