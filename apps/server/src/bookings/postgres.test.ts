import { randomUUID } from "node:crypto";
import type { AuthClaims } from "@office/shared";
import postgres, { type Sql } from "postgres";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { UnauthorizedError } from "../auth/verify.js";
import { localSupabase } from "../db/local.js";
import { createPostgresRepo, PostgresRepo } from "../db/postgres.js";
import { NotFoundError } from "../db/repo.js";
import { createPostgresBookingStore } from "./postgres.js";
import {
  BookingForbiddenError,
  BookingValidationError,
  RoomBusyError,
  type BookingStore,
} from "./store.js";

vi.setConfig({ testTimeout: 30_000 });

/** Null when the suite must skip: unreachable Supabase, or the migration missing. */
async function probeBookings(): Promise<{ url: string; skipped: null } | { url: null; skipped: string }> {
  let databaseUrl: string;
  try {
    databaseUrl = localSupabase().databaseUrl;
  } catch {
    return { url: null, skipped: "local Supabase is not reachable (`pnpm db:start`)" };
  }
  const sql = postgres(databaseUrl, { connect_timeout: 5, max: 1 });
  try {
    const tables = await sql`SELECT to_regclass('public.bookings') AS bookings`;
    if (!tables[0]?.["bookings"]) {
      return { url: null, skipped: "the bookings migration is not applied yet" };
    }
    return { url: databaseUrl, skipped: null };
  } catch {
    return { url: null, skipped: "local Supabase is not reachable (`pnpm db:start`)" };
  } finally {
    await sql.end();
  }
}

const PROBE = await probeBookings();

describe.runIf(PROBE.url === null)("PostgresBookingStore (skipped)", () => {
  it("needs local Supabase with the bookings migration", () => {
    console.warn(`[bookings] skipping: ${PROBE.skipped}`);
  });
});

describe.runIf(PROBE.url !== null)("PostgresBookingStore", () => {
  let repo: PostgresRepo;
  let store: BookingStore;
  let admin: Sql;
  const workspaces: string[] = [];

  interface Fixture {
    workspaceId: string;
    host: AuthClaims;
    guest: AuthClaims;
  }

  async function makeFixture(tag: string): Promise<Fixture> {
    const workspaceId = `p6b-${tag}-${randomUUID()}`;
    const hostId = randomUUID();
    const guestId = randomUUID();
    workspaces.push(workspaceId);
    await admin`INSERT INTO workspaces (id, name) VALUES (${workspaceId}, ${tag})`;
    await admin`INSERT INTO memberships (workspace_id, user_id, role)
      VALUES (${workspaceId}, ${hostId}, 'member'), (${workspaceId}, ${guestId}, 'member')`;
    return {
      workspaceId,
      host: { userId: hostId, name: "Host", workspaceId },
      guest: { userId: guestId, name: "Guest", workspaceId },
    };
  }

  const acme = (inviteeId: string) => ({
    zoneId: "acme_room",
    title: "Acme sync",
    agenda: "Q3 review",
    inviteeIds: [inviteeId],
  });

  beforeAll(() => {
    repo = createPostgresRepo(PROBE.url!);
    store = createPostgresBookingStore(repo);
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

  it("creates, reads and lists the open bookings", async () => {
    const fx = await makeFixture("crud");
    const booking = await store.create(fx.host, acme(fx.guest.userId));
    expect(booking).toMatchObject({
      workspaceId: fx.workspaceId,
      zoneId: "acme_room",
      hostId: fx.host.userId,
      inviteeIds: [fx.guest.userId],
      status: "open",
    });
    await expect(store.get(fx.host, booking.id)).resolves.toMatchObject({ id: booking.id });
    await expect(store.listOpen(fx.host)).resolves.toHaveLength(1);
    await store.end(fx.host, booking.id);
    await expect(store.listOpen(fx.host)).resolves.toHaveLength(0);
  });

  it("refuses a second open booking per zone, and frees it on end", async () => {
    const fx = await makeFixture("busy");
    const first = await store.create(fx.host, acme(fx.guest.userId));
    await expect(store.create(fx.guest, acme(fx.host.userId))).rejects.toBeInstanceOf(RoomBusyError);
    await store.end(fx.host, first.id);
    await expect(store.create(fx.guest, acme(fx.host.userId))).resolves.toMatchObject({
      status: "open",
    });
  });

  it("refuses zones that cannot be booked and virtual meetings", async () => {
    const fx = await makeFixture("zones");
    await expect(
      store.create(fx.host, { ...acme(fx.guest.userId), zoneId: "tea_point" }),
    ).rejects.toBeInstanceOf(BookingValidationError);
    await expect(
      store.create(fx.host, { ...acme(fx.guest.userId), zoneId: null }),
    ).rejects.toBeInstanceOf(BookingValidationError);
  });

  it("refuses an invitee outside the workspace", async () => {
    const fx = await makeFixture("invitee");
    await expect(store.create(fx.host, acme(randomUUID()))).rejects.toBeInstanceOf(
      BookingValidationError,
    );
  });

  it("ends host-only, and reports unknown bookings", async () => {
    const fx = await makeFixture("end");
    const booking = await store.create(fx.host, acme(fx.guest.userId));
    await expect(store.end(fx.guest, booking.id)).rejects.toBeInstanceOf(BookingForbiddenError);
    await expect(store.end(fx.host, randomUUID())).rejects.toBeInstanceOf(NotFoundError);
  });

  it("refuses writes from non-members", async () => {
    const fx = await makeFixture("member");
    const outsider: AuthClaims = { userId: randomUUID(), name: "Mallory", workspaceId: fx.workspaceId };
    await expect(store.create(outsider, acme(fx.guest.userId))).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
  });

  it("isolates workspaces through RLS", async () => {
    const a = await makeFixture("rls-a");
    const b = await makeFixture("rls-b");
    const booking = await store.create(a.host, acme(a.guest.userId));
    await expect(store.listOpen(b.host)).resolves.toHaveLength(0);
    await expect(store.get(b.host, booking.id)).resolves.toBeNull();
    await expect(store.listOpen(a.host)).resolves.toHaveLength(1);
  });

  it("grants the browser keys no writes on bookings", async () => {
    const grants = await admin`
      SELECT grantee, privilege_type FROM information_schema.role_table_grants
      WHERE table_schema = 'public' AND table_name = 'bookings'
        AND grantee IN ('anon', 'authenticated')
    `;
    const privs = grants.map((row) => `${row["grantee"]}:${row["privilege_type"]}`);
    expect(privs).toContain("authenticated:SELECT");
    for (const priv of privs) {
      expect(priv).not.toMatch(/INSERT|UPDATE|DELETE|TRUNCATE/);
    }
  });
});
