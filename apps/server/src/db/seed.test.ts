import {
  DEMO_ACCOUNT,
  DEMO_COMMITMENT,
  DEMO_CONTACT,
  DEMO_MILESTONE,
  DEMO_PROJECT,
  DEMO_TASKS,
  WORKSPACE_ID,
  type AuthClaims,
  type DemoPersonKey,
} from "@office/shared";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { localSupabase, type LocalSupabase } from "./local.js";
import { createPostgresRepo, type PostgresRepo } from "./postgres.js";
import { runSeed, SEED_PASSWORD_FALLBACK } from "./seed.js";

vi.setConfig({ testTimeout: 120_000 });

/** Null when local Supabase is not reachable: the suite skips instead of failing. */
function probeEnv(): LocalSupabase | null {
  try {
    return localSupabase();
  } catch {
    return null;
  }
}

const ENV = probeEnv();

describe.runIf(ENV === null)("seed (skipped)", () => {
  it("needs local Supabase", () => {
    console.warn("[db] skipping: local Supabase is not reachable (`pnpm db:start`)");
  });
});

describe.runIf(ENV !== null)("seed", () => {
  let repo: PostgresRepo;
  let userIds: Record<DemoPersonKey, string>;

  beforeAll(async () => {
    const env = ENV as LocalSupabase;
    repo = createPostgresRepo(env.databaseUrl);
    // Twice on purpose: the seed must be idempotent.
    for (let run = 0; run < 2; run += 1) {
      userIds = (
        await runSeed({
          supabaseUrl: env.supabaseUrl,
          serviceRoleKey: env.serviceRoleKey,
          databaseUrl: env.databaseUrl,
          password: SEED_PASSWORD_FALLBACK,
        })
      ).userIds;
    }
  });

  afterAll(async () => {
    await repo.close();
  });

  function claims(): AuthClaims {
    return { userId: userIds.maya, name: "Maya", workspaceId: WORKSPACE_ID };
  }

  it("seeds rows matching the shared demo data", async () => {
    const owner = (key: string): string => userIds[key as DemoPersonKey];
    expect(await repo.account(claims(), DEMO_ACCOUNT.id)).toEqual({
      ...DEMO_ACCOUNT,
      ownerId: owner(DEMO_ACCOUNT.ownerId),
    });
    expect(await repo.contacts(claims(), DEMO_ACCOUNT.id)).toEqual([DEMO_CONTACT]);
    expect(await repo.project(claims(), DEMO_PROJECT.id)).toEqual({
      ...DEMO_PROJECT,
      ownerId: owner(DEMO_PROJECT.ownerId),
    });
    expect(await repo.milestone(claims(), DEMO_MILESTONE.id)).toEqual(DEMO_MILESTONE);
    const tasks = await repo.tasks(claims(), { projectId: DEMO_PROJECT.id });
    expect(tasks).toHaveLength(3);
    for (const demo of DEMO_TASKS) {
      expect(tasks.find((t) => t.id === demo.id)).toEqual({
        ...demo,
        ownerId: demo.ownerId === null ? null : owner(demo.ownerId),
      });
    }
    expect(await repo.commitment(claims(), DEMO_COMMITMENT.id)).toEqual(DEMO_COMMITMENT);
  });

  it("seeds memberships and profiles", async () => {
    expect(await repo.member(claims())).toEqual({
      userId: userIds.maya,
      workspaceId: WORKSPACE_ID,
      role: "member",
    });
    const people = await repo.people(claims());
    expect(people).toContainEqual({ id: userIds.maya, name: "Maya" });
    expect(people).toContainEqual({ id: userIds.arjun, name: "Arjun" });
  });
});
