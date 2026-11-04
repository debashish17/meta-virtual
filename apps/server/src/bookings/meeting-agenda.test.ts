import { randomUUID } from "node:crypto";
import {
  ACME_SYNC_TRANSCRIPT,
  WORKSPACE_ID,
  type AuthClaims,
  type Meeting,
} from "@office/shared";
import postgres, { type Sql } from "postgres";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { FixtureLlm } from "../llm/fixture.js";
import type { LlmClient, MeetingContext } from "../llm/types.js";
import { localSupabase } from "../db/local.js";
import { createPostgresRepo, PostgresRepo } from "../db/postgres.js";
import { InMemoryRepo } from "../db/repo.js";
import { processMeeting } from "../meetings/pipeline.js";
import { demoSnapshot } from "../meetings/testSnapshot.js";

vi.setConfig({ testTimeout: 30_000 });

/**
 * The booking agenda on meetings (P6-B task 5): `POST /meetings` with a
 * `bookingId` stores the agenda with the meeting (the route wiring is a lead
 * request; these are the owned lines), the drawer shows it above the summary,
 * the extraction context includes it, and the fixture output is unchanged.
 */

const MAYA: AuthClaims = { userId: "dev-maya", name: "Maya", workspaceId: WORKSPACE_ID };
const CONTEXT: MeetingContext = { zoneId: "acme_room" };

/** An `LlmClient` that records the context it was given. */
class ContextSpy implements LlmClient {
  contexts: unknown[] = [];

  async extractMeeting(_transcript: string, context: MeetingContext): Promise<unknown> {
    this.contexts.push(context);
    return { summary: "Done.", decisions: [], tasks: [], commitments: [], milestoneChanges: [] };
  }

  async answer(): Promise<unknown> {
    return { answer: "", sourceIds: [] };
  }
}

describe("meeting agenda", () => {
  it("stores the agenda with the meeting in memory", async () => {
    const repo = new InMemoryRepo();
    const bookingId = randomUUID();
    const created = await repo.createMeeting(MAYA, {
      zoneId: "acme_room",
      transcript: "Maya: go-live moves.",
      summary: "Go-live moves.",
      decisions: [],
      agenda: "Q3 review",
      bookingId,
    });
    expect(created.agenda).toBe("Q3 review");
    const read = (await repo.meeting(MAYA, created.id)) as Meeting;
    expect(read.agenda).toBe("Q3 review");
    const plain = await repo.createMeeting(MAYA, {
      zoneId: "acme_room",
      transcript: "t",
      summary: "s",
      decisions: [],
    });
    expect(plain.agenda).toBeUndefined();
  });

  it("hands the agenda to extraction through the context", async () => {
    const spy = new ContextSpy();
    await processMeeting({
      llm: spy,
      transcript: "Maya: go-live moves.",
      context: CONTEXT,
      snapshot: demoSnapshot(),
      agenda: "Q3 review",
    });
    expect(spy.contexts).toHaveLength(1);
    expect(spy.contexts[0]).toMatchObject({ zoneId: "acme_room", agenda: "Q3 review" });
  });

  it("leaves the fixture output for the demo transcript unchanged", async () => {
    const run = (agenda: string | undefined) =>
      processMeeting({
        llm: new FixtureLlm(),
        transcript: ACME_SYNC_TRANSCRIPT,
        context: CONTEXT,
        snapshot: demoSnapshot(),
        meetingId: "00000000-0000-4000-8000-000000000000",
        nextId: (() => {
          let n = 0;
          return () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
        })(),
        ...(agenda === undefined ? {} : { agenda }),
      });
    const [without, withAgenda] = await Promise.all([run(undefined), run("Q3 review")]);
    expect(withAgenda).toEqual(without);
    expect(withAgenda.fallback).toBe(false);
    expect(withAgenda.changes).toHaveLength(4);
  });
});

/** Null when the Postgres agenda check must skip (unreachable, or unmigrated). */
async function probeMeetings(): Promise<string | null> {
  let databaseUrl: string;
  try {
    databaseUrl = localSupabase().databaseUrl;
  } catch {
    return null;
  }
  const sql = postgres(databaseUrl, { connect_timeout: 5, max: 1 });
  try {
    const cols = await sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'meetings' AND column_name = 'agenda'
    `;
    return cols.length > 0 ? databaseUrl : null;
  } catch {
    return null;
  } finally {
    await sql.end();
  }
}

const DATABASE_URL = await probeMeetings();

describe.runIf(DATABASE_URL === null)("meeting agenda in Postgres (skipped)", () => {
  it("needs local Supabase with the bookings migration", () => {
    console.warn("[bookings] skipping: local Supabase is not reachable or unmigrated");
  });
});

describe.runIf(DATABASE_URL !== null)("meeting agenda in Postgres", () => {
  let repo: PostgresRepo;
  let admin: Sql;
  const workspaces: string[] = [];

  beforeAll(() => {
    repo = createPostgresRepo(DATABASE_URL as string);
    admin = postgres(DATABASE_URL as string, { max: 1 });
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

  it("stores the agenda and the booking link with the meeting", async () => {
    const workspaceId = `p6b-agenda-${randomUUID()}`;
    const userId = randomUUID();
    const bookingId = randomUUID();
    workspaces.push(workspaceId);
    await admin`INSERT INTO workspaces (id, name) VALUES (${workspaceId}, 'agenda')`;
    await admin`INSERT INTO memberships (workspace_id, user_id, role)
      VALUES (${workspaceId}, ${userId}, 'member')`;
    await admin`INSERT INTO bookings
        (id, workspace_id, zone_id, title, agenda, host_id, invitee_ids, status, created_at, ended_at)
      VALUES (${bookingId}, ${workspaceId}, 'acme_room', 'Acme sync', 'Q3 review',
        ${userId}, ${[userId]}, 'open', ${Date.now()}, NULL)`;
    const claims: AuthClaims = { userId, name: "Host", workspaceId };

    const created = await repo.createMeeting(claims, {
      zoneId: "acme_room",
      transcript: "Maya: go-live moves.",
      summary: "Go-live moves.",
      decisions: [],
      agenda: "Q3 review",
      bookingId,
    });
    expect(created.agenda).toBe("Q3 review");
    const read = await repo.meeting(claims, created.id);
    expect(read?.agenda).toBe("Q3 review");
    const rows = await admin`SELECT booking_id FROM meetings WHERE id = ${created.id}`;
    expect(String(rows[0]?.["booking_id"])).toBe(bookingId);
  });
});
