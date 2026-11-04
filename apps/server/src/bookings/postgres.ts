import { randomUUID } from "node:crypto";
import { Booking, type AuthClaims, type Booking as BookingData } from "@office/shared";
import type { Row, TransactionSql } from "postgres";
import { UnauthorizedError } from "../auth/verify.js";
import { NotFoundError } from "../db/repo.js";
import type { PostgresRepo } from "../db/postgres.js";
import {
  BookingForbiddenError,
  BookingValidationError,
  RoomBusyError,
  checkBookableZone,
  type BookingStore,
} from "./store.js";

/**
 * The Postgres booking store (ARCHITECTURE.md 12.10): reads through
 * `PostgresRepo.withUser` (RLS applies) and writes through `withService` after
 * a membership check (12.4). One open booking per zone is a partial unique
 * index (`supabase/migrations/20261103000100_bookings.sql`), so the busy check
 * holds under races; invitees are checked against `memberships` in the same
 * transaction as the insert.
 */

function ms(value: unknown): number {
  return typeof value === "bigint" ? Number(value) : Number(value);
}

function mapBooking(row: Row): BookingData {
  return Booking.parse({
    id: row["id"],
    workspaceId: row["workspace_id"],
    zoneId: row["zone_id"],
    title: row["title"],
    agenda: row["agenda"],
    hostId: row["host_id"],
    inviteeIds: row["invitee_ids"],
    status: row["status"],
    createdAt: ms(row["created_at"]),
    endedAt: row["ended_at"] === null ? null : ms(row["ended_at"]),
  });
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "23505"
  );
}

export function createPostgresBookingStore(repo: PostgresRepo): BookingStore {
  return {
    async create(
      claims: AuthClaims,
      input: { zoneId: string | null; title: string; agenda: string; inviteeIds: string[] },
    ): Promise<BookingData> {
      const zoneId = checkBookableZone(input.zoneId);
      return repo.withService(async (tx) => {
        const member = await repo.member(claims);
        if (!member) {
          throw new UnauthorizedError("not a member of this workspace");
        }
        const known = await tx`
          SELECT user_id FROM memberships
          WHERE workspace_id = ${claims.workspaceId} AND user_id = ANY(${input.inviteeIds})
        `;
        const seen = new Set(known.map((row) => String(row["user_id"])));
        const outside = input.inviteeIds.find((id) => !seen.has(id));
        if (outside !== undefined) {
          throw new BookingValidationError(`invitee ${outside} is outside this workspace`);
        }
        try {
          const rows = await tx`
            INSERT INTO bookings
              (id, workspace_id, zone_id, title, agenda, host_id, invitee_ids, status, created_at, ended_at)
            VALUES (${randomUUID()}, ${claims.workspaceId}, ${zoneId}, ${input.title},
              ${input.agenda}, ${claims.userId}, ${input.inviteeIds}, 'open', ${Date.now()}, NULL)
            RETURNING *
          `;
          return mapBooking(rows[0]);
        } catch (error) {
          if (isUniqueViolation(error)) {
            throw new RoomBusyError(zoneId);
          }
          throw error;
        }
      });
    },

    async get(claims: AuthClaims, id: string): Promise<BookingData | null> {
      return repo.withUser(claims, async (tx: TransactionSql) => {
        const rows = await tx`
          SELECT * FROM bookings WHERE workspace_id = ${claims.workspaceId} AND id = ${id}
        `;
        return rows[0] ? mapBooking(rows[0]) : null;
      });
    },

    async listOpen(claims: AuthClaims): Promise<BookingData[]> {
      return repo.withUser(claims, async (tx: TransactionSql) => {
        const rows = await tx`
          SELECT * FROM bookings
          WHERE workspace_id = ${claims.workspaceId} AND status = 'open'
          ORDER BY created_at
        `;
        return rows.map((row) => mapBooking(row));
      });
    },

    async end(claims: AuthClaims, id: string): Promise<void> {
      await repo.withService(async (tx) => {
        const member = await repo.member(claims);
        if (!member) {
          throw new UnauthorizedError("not a member of this workspace");
        }
        const rows = await tx`
          SELECT * FROM bookings
          WHERE workspace_id = ${claims.workspaceId} AND id = ${id}
          FOR UPDATE
        `;
        const row = rows[0];
        if (!row) {
          throw new NotFoundError(`unknown booking ${id}`);
        }
        const booking = mapBooking(row);
        if (booking.hostId !== claims.userId) {
          throw new BookingForbiddenError("only the host ends their booking");
        }
        if (booking.status === "ended") {
          return;
        }
        await tx`
          UPDATE bookings SET status = 'ended', ended_at = ${Date.now()}
          WHERE workspace_id = ${claims.workspaceId} AND id = ${id}
        `;
      });
    },
  };
}
