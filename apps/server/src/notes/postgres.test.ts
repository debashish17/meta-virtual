import { randomUUID } from "node:crypto";
import type { AuthClaims } from "@office/shared";
import postgres, { type Sql, type TransactionSql } from "postgres";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { UnauthorizedError } from "../auth/verify.js";
import { localSupabase } from "../db/local.js";
import { createPostgresRepo, PostgresRepo } from "../db/postgres.js";
import { NotFoundError } from "../db/repo.js";
import { createPostgresNoteStore } from "./postgres.js";
import type { NoteStore } from "./store.js";

vi.setConfig({ testTimeout: 30_000 });

/** Null when the suite must skip: unreachable Supabase, or the migration missing. */
async function probeNotes(): Promise<{ url: string; skipped: null } | { url: null; skipped: string }> {
  let databaseUrl: string;
  try {
    databaseUrl = localSupabase().databaseUrl;
  } catch {
    return { url: null, skipped: "local Supabase is not reachable (`pnpm db:start`)" };
  }
  const sql = postgres(databaseUrl, { connect_timeout: 5, max: 1 });
  try {
    const tables = await sql`SELECT to_regclass('public.notes') AS notes`;
    if (!tables[0]?.["notes"]) {
      return { url: null, skipped: "the notes migration is not applied yet" };
    }
    return { url: databaseUrl, skipped: null };
  } catch {
    return { url: null, skipped: "local Supabase is not reachable (`pnpm db:start`)" };
  } finally {
    await sql.end();
  }
}

const PROBE = await probeNotes();

describe.runIf(PROBE.url === null)("PostgresNoteStore (skipped)", () => {
  it("needs local Supabase with the notes migration", () => {
    console.warn(`[notes] skipping: ${PROBE.skipped}`);
  });
});

describe.runIf(PROBE.url !== null)("PostgresNoteStore", () => {
  let repo: PostgresRepo;
  let store: NoteStore;
  let admin: Sql;
  const workspaces: string[] = [];

  interface Fixture {
    workspaceId: string;
    maya: AuthClaims;
    arjun: AuthClaims;
  }

  async function makeFixture(tag: string): Promise<Fixture> {
    const workspaceId = `p6c-${tag}-${randomUUID()}`;
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
    store = createPostgresNoteStore(repo);
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

  it("creates, lists, updates and deletes the author's own notes", async () => {
    const fx = await makeFixture("crud");
    const note = await store.create(fx.maya, { text: "Buy milk", color: "yellow" });
    expect(note).toMatchObject({
      workspaceId: fx.workspaceId,
      userId: fx.maya.userId,
      text: "Buy milk",
      color: "yellow",
      done: false,
    });
    await expect(store.list(fx.maya)).resolves.toHaveLength(1);
    await expect(store.update(fx.maya, note.id, { done: true })).resolves.toMatchObject({
      id: note.id,
      done: true,
    });
    await store.remove(fx.maya, note.id);
    await expect(store.list(fx.maya)).resolves.toHaveLength(0);
  });

  it("keeps one author's notes from the other: no read, change or delete", async () => {
    const fx = await makeFixture("author");
    const mayas = await store.create(fx.maya, { text: "Buy milk", color: "yellow" });
    await store.create(fx.arjun, { text: "Call Acme", color: "pink" });

    const arjuns = await store.list(fx.arjun);
    expect(arjuns.map((note) => note.id)).not.toContain(mayas.id);
    await expect(store.update(fx.arjun, mayas.id, { done: true })).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(store.remove(fx.arjun, mayas.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(store.list(fx.maya)).resolves.toMatchObject([
      { id: mayas.id, text: "Buy milk", done: false },
    ]);
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

  it("restricts reads to the author through RLS, with no author filter in the query", async () => {
    const fx = await makeFixture("rls");
    const mayas = await store.create(fx.maya, { text: "Buy milk", color: "yellow" });
    const arjuns = await store.create(fx.arjun, { text: "Call Acme", color: "pink" });

    const readRaw = (claims: AuthClaims) =>
      repo.withUser(claims, async (tx: TransactionSql) => {
        return tx`SELECT id, user_id FROM notes WHERE workspace_id = ${claims.workspaceId}`;
      });

    const asMaya = await readRaw(fx.maya);
    expect(asMaya.map((row) => String(row["id"]))).toEqual([mayas.id]);
    const asArjun = await readRaw(fx.arjun);
    expect(asArjun.map((row) => String(row["id"]))).toEqual([arjuns.id]);
  });

  it("selects author-only, not workspace-wide", async () => {
    const policies = await admin`
      SELECT policyname, qual FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'notes' AND cmd = 'SELECT'
    `;
    expect(policies).toHaveLength(1);
    const qual = String(policies[0]?.["qual"] ?? "");
    expect(qual).toContain("request_user_id()");
    expect(qual).not.toContain("is_workspace_member");
  });

  it("grants the browser keys no writes on notes", async () => {
    const grants = await admin`
      SELECT grantee, privilege_type FROM information_schema.role_table_grants
      WHERE table_schema = 'public' AND table_name = 'notes'
        AND grantee IN ('anon', 'authenticated')
    `;
    const privs = grants.map((row) => `${row["grantee"]}:${row["privilege_type"]}`);
    expect(privs).toContain("authenticated:SELECT");
    for (const priv of privs) {
      expect(priv).not.toMatch(/INSERT|UPDATE|DELETE|TRUNCATE/);
    }
  });
});
