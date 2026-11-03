import type { AuthClaims, Booking, BookingCreate } from "@office/shared";

/**
 * Room bookings (ARCHITECTURE.md 12.10, P6-B): create (a bookable zone, one open booking
 * per zone), list the open ones, end (host only). P6-0 slot: the interface and an empty
 * in-memory store; P6-B adds the Postgres implementation, the migration and the errors
 * (400 for an unbookable zone, 409 `room_busy`, 403 for a non-host end).
 */
export interface BookingStore {
  create(claims: AuthClaims, input: BookingCreate): Promise<Booking>;
  listOpen(claims: AuthClaims): Promise<Booking[]>;
  end(claims: AuthClaims, id: string): Promise<void>;
}

const TODO = "bookings are not implemented yet (P6-B)";

export function createInMemoryBookingStore(): BookingStore {
  return {
    create: () => Promise.reject(new Error(TODO)),
    listOpen: () => Promise.resolve([]),
    end: () => Promise.reject(new Error(TODO)),
  };
}
