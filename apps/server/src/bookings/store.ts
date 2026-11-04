import { randomUUID } from "node:crypto";
import {
  Booking,
  isBookableZone,
  type AuthClaims,
  type Booking as BookingData,
  type BookingCreate,
} from "@office/shared";
import { NotFoundError } from "../db/repo.js";

/**
 * Room bookings (ARCHITECTURE.md 12.10, P6-B): create (a bookable zone, one open
 * booking per zone), read one (for `POST /meetings` with a `bookingId`), list
 * the open ones, end (host only).
 */

/** A 400: the zone cannot be booked, or an invitee is outside the workspace. */
export class BookingValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BookingValidationError";
  }
}

/** A 409 `room_busy`: the zone already has an open booking. */
export class RoomBusyError extends Error {
  readonly zoneId: string;

  constructor(zoneId: string) {
    super(`zone ${zoneId} already has an open booking`);
    this.name = "RoomBusyError";
    this.zoneId = zoneId;
  }
}

/** A 403: only the host ends their booking. */
export class BookingForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BookingForbiddenError";
  }
}

export interface BookingStore {
  create(claims: AuthClaims, input: BookingCreate): Promise<BookingData>;
  get(claims: AuthClaims, id: string): Promise<BookingData | null>;
  listOpen(claims: AuthClaims): Promise<BookingData[]>;
  end(claims: AuthClaims, id: string): Promise<void>;
}

/**
 * Shared create validation: a bookable zone (virtual meetings are cut first,
 * WORK_PACKAGES.md P6-B, so `zoneId: null` is refused until LiveKit exists).
 * The invitee check lives in the routes (over `Repo.people`) and in the
 * Postgres store (over `memberships`); the in-memory store has no user
 * directory, so it trusts the routes there.
 */
export function checkBookableZone(zoneId: string | null): string {
  if (zoneId === null) {
    throw new BookingValidationError("virtual meetings are not available yet");
  }
  if (!isBookableZone(zoneId)) {
    throw new BookingValidationError(`zone ${zoneId} cannot be booked`);
  }
  return zoneId;
}

export function createInMemoryBookingStore(): BookingStore {
  const bookings = new Map<string, BookingData>();

  const openFor = (workspaceId: string, zoneId: string): BookingData | undefined =>
    [...bookings.values()].find(
      (booking) =>
        booking.workspaceId === workspaceId &&
        booking.zoneId === zoneId &&
        booking.status === "open",
    );

  return {
    async create(claims: AuthClaims, input: BookingCreate): Promise<BookingData> {
      const zoneId = checkBookableZone(input.zoneId);
      if (openFor(claims.workspaceId, zoneId)) {
        throw new RoomBusyError(zoneId);
      }
      const booking = Booking.parse({
        id: randomUUID(),
        workspaceId: claims.workspaceId,
        zoneId,
        title: input.title,
        agenda: input.agenda,
        hostId: claims.userId,
        inviteeIds: [...input.inviteeIds],
        status: "open",
        createdAt: Date.now(),
        endedAt: null,
      });
      bookings.set(booking.id, booking);
      return structuredClone(booking);
    },

    async get(claims: AuthClaims, id: string): Promise<BookingData | null> {
      const booking = bookings.get(id);
      if (!booking || booking.workspaceId !== claims.workspaceId) {
        return null;
      }
      return structuredClone(booking);
    },

    async listOpen(claims: AuthClaims): Promise<BookingData[]> {
      return structuredClone(
        [...bookings.values()]
          .filter(
            (booking) => booking.workspaceId === claims.workspaceId && booking.status === "open",
          )
          .sort((a, b) => a.createdAt - b.createdAt),
      );
    },

    async end(claims: AuthClaims, id: string): Promise<void> {
      const booking = bookings.get(id);
      if (!booking || booking.workspaceId !== claims.workspaceId) {
        throw new NotFoundError(`unknown booking ${id}`);
      }
      if (booking.hostId !== claims.userId) {
        throw new BookingForbiddenError("only the host ends their booking");
      }
      if (booking.status === "ended") {
        return;
      }
      booking.status = "ended";
      booking.endedAt = Date.now();
    },
  };
}
