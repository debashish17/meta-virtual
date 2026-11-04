import { randomUUID } from "node:crypto";
import type { AuthClaims } from "@office/shared";
import postgres, { type Sql, type TransactionSql } from "postgres";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { UnauthorizedError } from "../auth/verify.js";
import { localSupabase } from "../db/local.js";
import { createPostgresRepo, PostgresRepo } from "../db/postgres.js";
import { NotFoundError } from "../db/repo.js";
import { createPostgresBoardStore } from "./postgres.js";
import { BoardForbiddenError, type BoardStore } from "./store.js";

vi.setConfig({ testTimeout: 30_000 });

/** Null when the suite must skip: unreachable Supabase, or the migration missing. */
async function probeBoard(): Promise<{ url: string; skipped: null } | { url: null; skipped: string }> {
  let databaseUrl: string;
  try {
    databaseUrl = localSupabase().databaseUrl;
  } catch {
    return { url: null, skipped: "local Supabase is not reachable (`pnpm db:start`)" };
  }
  const sql = postgres(databaseUrl, { connect_timeout: 5, max: 1 });
  try {
    const tables = await sql`SELECT to_regclass('public.board_pins') AS board_pins`;
    if (!tables[0]?.["board_pins"]) {
      return { url: null, skipped: "the board migration is not applied yet" };
    }
    return { url: databaseUrl, skipped: null };
  } catch {
    return { url: null, skipped: "local Supabase is not reachable (`pnpm db:start`)" };
  } finally {
    await sql.end();
  }
}

const PROBE = await probeBoard();

describe.runIf(PROBE.url === null)("PostgresBoardStore (skipped)", () => {
  it("needs local Supabase with the board migration", () => {
    console.warn(`[board] skipping: ${PROBE.skipped}`);
  });
});

describe.runIf(PROBE.url !== null)("PostgresBoardStore", () => {
  let repo: PostgresRepo;
  let store: BoardStore;
  let admin: Sql;
  const workspaces: string[] = [];

  interface Fixture {
    workspaceId: string;
    maya: AuthClaims;
    arjun: AuthClaims;
  }

  async function makeFixture(tag: string): Promise<Fixture> {
    const workspaceId = `p6d-${tag}-${randomUUID()}`;
    const mayaId = randomUUID();
    const arjunId = randomUUID();
    workspaces.push(workspaceId);
    await admin`INSERT INTO workspaces (id, name) VALUES (${workspaceId}, ${tag})`;
    await admin`INSERT INTO memberships (workspace_id, user_id, role)
      VALUES (${workspaceId}, ${mayaId}, 'member'), (${workspaceId}, ${arjunId}, 'member')`;
    return {
      workspaceId,
      maya: { userId: mayaId, name: "Maya", workspaceId },
      arjun: { userId: arjunId, name: "Arjun", workspaceId },
    };
  }

  beforeAll(() => {
    repo = createPostgresRepo(PROBE.url!);
    store = createPostgresBoardStore(repo);
    admin = postgres(PROBE.url!, { max: 1 });
  });

  afterEach(async () => {
    for (const workspaceId of workspaces.splice(0)) {
      await admin`DELETE FROM workspaces WHERE id = ${workspaceId}`;
    }
  });

  afterAll(async () => {
    await repo.close();
    await admin.end();
  });

  it("pins, lists and removes the author's own pins", async () => {
    const fx = await makeFixture("crud");
    const pin = await store.create(fx.maya, { text: "Ship it", color: "pink" });
    expect(pin).toMatchObject({
      workspaceId: fx.workspaceId,
      authorId: fx.maya.userId,
      authorName: "Maya",
      text: "Ship it",
      color: "pink",
    });
    await expect(store.list(fx.maya)).resolves.toHaveLength(1);
    await store.remove(fx.maya, pin.id);
    await expect(store.list(fx.maya)).resolves.toHaveLength(0);
  });

  it("shows the workspace's pins to everyone, but only the author removes", async () => {
    const fx = await makeFixture("author");
    const mayas = await store.create(fx.maya, { text: "Ship it", color: "pink" });
    await store.create(fx.arjun, { text: "Demo on Friday", color: "yellow" });

    const arjuns = await store.list(fx.arjun);
    expect(arjuns.map((pin) => pin.id)).toContain(mayas.id);
    await expect(store.remove(fx.arjun, mayas.id)).rejects.toBeInstanceOf(
      BoardForbiddenError,
    );
    await expect(store.list(fx.maya)).resolves.toMatchObject([
      { id: mayas.id, text: "Ship it" },
      { text: "Demo on Friday" },
    ]);
  });

  it("reads another workspace's pins as missing", async () => {
    const fx = await makeFixture("isolation");
    const other = await makeFixture("isolation-other");
    const pin = await store.create(fx.maya, { text: "Ship it", color: "pink" });
    await expect(store.list(other.maya)).resolves.toHaveLength(0);
    await expect(store.remove(other.maya, pin.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("refuses writes from non-members", async () => {
    const fx = await makeFixture("member");
    const outsider: AuthClaims = {
      userId: randomUUID(),
      name: "Mallory",
      workspaceId: fx.workspaceId,
    };
    await expect(
      store.create(outsider, { text: "Sneak in", color: "yellow" }),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("restricts reads to workspace members through RLS, with no member filter in the query", async () => {
    const fx = await makeFixture("rls");
    const other = await makeFixture("rls-other");
    const mayas = await store.create(fx.maya, { text: "Ship it", color: "pink" });
    await store.create(other.maya, { text: "Elsewhere", color: "blue" });

    const readRaw = (claims: AuthClaims) =>
      repo.withUser(claims, async (tx: TransactionSql) => {
        return tx`SELECT id, author_id FROM board_pins WHERE workspace_id = ${claims.workspaceId}`;
      });

    const asMaya = await readRaw(fx.maya);
    expect(asMaya.map((row) => String(row["id"]))).toEqual([mayas.id]);
    // Same query, another workspace: RLS keeps its own rows only.
    const asOther = await readRaw(other.maya);
    expect(asOther.map((row) => String(row["id"]))).toHaveLength(1);
    expect(asOther[0]?.["id"]).not.toBe(mayas.id);
  });

  it("selects workspace-wide for members, not author-only", async () => {
    const policies = await admin`
      SELECT policyname, qual FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'board_pins' AND cmd = 'SELECT'
    `;
    expect(policies).toHaveLength(1);
    const qual = String(policies[0]?.["qual"] ?? "");
    expect(qual).toContain("is_workspace_member");
    expect(qual).not.toContain("request_user_id()");
  });

  it("grants the browser keys no writes on board_pins", async () => {
    const grants = await admin`
      SELECT grantee, privilege_type FROM information_schema.role_table_grants
      WHERE table_schema = 'public' AND table_name = 'board_pins'
        AND grantee IN ('anon', 'authenticated')
    `;
    const privs = grants.map((row) => `${row["grantee"]}:${row["privilege_type"]}`);
    expect(privs).toContain("authenticated:SELECT");
    for (const priv of privs) {
      expect(priv).not.toMatch(/INSERT|UPDATE|DELETE|TRUNCATE/);
    }
  });
});
