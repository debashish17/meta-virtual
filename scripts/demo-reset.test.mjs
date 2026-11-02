// Tests for `pnpm demo:reset` (P4-B task 1): the pure logic of
// `scripts/demo-reset.mjs` — target parsing, the hosted guards, and the
// no-secrets rule. Run from the repo root with:
//   npx vitest run scripts/demo-reset.test.mjs
// (The root package has no `test` task that covers scripts/; see the P4-B
// report's Requests. Never run the hosted path in tests.)
import { describe, expect, it } from "vitest";
import {
  DEMO_WORKSPACE_ID,
  WIPE_SQL,
  hostedGuards,
  hostOf,
  isLocalHost,
  parseArgs,
  restartHint,
} from "./demo-reset.mjs";

const HOSTED = {
  SUPABASE_URL: "https://db.example.supabase.co",
  DATABASE_URL: "postgresql://postgres:example-password@db.example.pooler.supabase.com:6543/postgres",
  SUPABASE_SERVICE_ROLE_KEY: "example-service-role-key",
  DEMO_RESET_CONFIRM: "db.example.supabase.co",
};

describe("demo-reset", () => {
  it("wipes exactly the demo workspace (children cascade from it)", () => {
    expect(DEMO_WORKSPACE_ID).toBe("northwind-demo");
    expect(WIPE_SQL).toContain("DELETE FROM public.workspaces");
    expect(WIPE_SQL).toContain("northwind-demo");
  });

  it("recognises local hosts", () => {
    expect(isLocalHost("localhost")).toBe(true);
    expect(isLocalHost("127.0.0.1")).toBe(true);
    expect(isLocalHost("::1")).toBe(true);
    expect(isLocalHost("db.example.supabase.co")).toBe(false);
    expect(isLocalHost("")).toBe(false);
  });

  it("reads hosts out of URLs, quietly on garbage", () => {
    expect(hostOf("https://db.example.supabase.co")).toBe("db.example.supabase.co");
    expect(hostOf("postgresql://postgres:pw@127.0.0.1:54322/postgres")).toBe("127.0.0.1");
    expect(hostOf("not a url")).toBe("");
    expect(hostOf("")).toBe("");
  });

  it("parses args: local by default, hosted and dry-run on request", () => {
    expect(parseArgs([])).toEqual({ target: "local", dryRun: false, help: false });
    expect(parseArgs(["--target=hosted"])).toEqual({ target: "hosted", dryRun: false, help: false });
    expect(parseArgs(["--target=local", "--dry-run"])).toEqual({ target: "local", dryRun: true, help: false });
    expect(parseArgs(["--help"])).toEqual({ target: "local", dryRun: false, help: true });
    expect(() => parseArgs(["--target=bogus"])).toThrow(/--target/);
    expect(() => parseArgs(["--wipe-everything"])).toThrow(/unknown/);
  });

  it("accepts a correctly confirmed hosted reset", () => {
    expect(hostedGuards(HOSTED)).toEqual({ host: "db.example.supabase.co" });
  });

  it("refuses a hosted reset that is not unmistakably confirmed", () => {
    expect(() => hostedGuards({ ...HOSTED, DEMO_RESET_CONFIRM: undefined })).toThrow(/DEMO_RESET_CONFIRM/);
    expect(() => hostedGuards({ ...HOSTED, DEMO_RESET_CONFIRM: "yes" })).toThrow(/DEMO_RESET_CONFIRM/);
    expect(() => hostedGuards({ ...HOSTED, DEMO_RESET_CONFIRM: "other.supabase.co" })).toThrow(/Without that exact value/);
  });

  it("refuses a hosted reset that could fall back to local", () => {
    expect(() => hostedGuards({ ...HOSTED, SUPABASE_URL: undefined })).toThrow(/SUPABASE_URL/);
    expect(() => hostedGuards({ ...HOSTED, SUPABASE_URL: "http://127.0.0.1:54321" })).toThrow(/local/);
    expect(() => hostedGuards({ ...HOSTED, DATABASE_URL: undefined })).toThrow(/DATABASE_URL/);
    expect(() => hostedGuards({ ...HOSTED, DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:54322/postgres" })).toThrow(
      /local/,
    );
    expect(() => hostedGuards({ ...HOSTED, SUPABASE_SERVICE_ROLE_KEY: undefined })).toThrow(
      /SUPABASE_SERVICE_ROLE_KEY/,
    );
  });

  it("never names a secret value in refusals or hints", () => {
    const refusals = [
      () => hostedGuards({ ...HOSTED, DEMO_RESET_CONFIRM: "nope" }),
      () => hostedGuards({ ...HOSTED, SUPABASE_SERVICE_ROLE_KEY: undefined }),
    ];
    for (const run of refusals) {
      try {
        run();
        expect.unreachable("expected hostedGuards to refuse");
      } catch (error) {
        const text = error instanceof Error ? error.message : String(error);
        expect(text).not.toContain("example-service-role-key");
        expect(text).not.toContain("example-password");
      }
    }
    const hint = restartHint({ PORT: "2568", ...HOSTED });
    expect(hint).toContain("2568");
    expect(hint).not.toContain("example-service-role-key");
    expect(hint).not.toContain("example-password");
  });

  it("prints the exact dev restart command for the current port", () => {
    expect(restartHint({})).toContain("PORT=2567");
    expect(restartHint({ PORT: "2568" })).toContain("PORT=2568");
    expect(restartHint({})).toContain("pnpm --filter @office/server dev");
  });
});
