import {
  Booking,
  BookingCreate,
  BookingList,
  WORKSPACE_ID,
  isBookableZone,
  type Booking as BookingData,
  type BookingCreate as BookingCreateData,
} from "@office/shared";
import { getAuthToken } from "../auth/session.js";
import { useMe } from "../office/me.js";
import { ApiError } from "./http.js";

/**
 * Room bookings (ARCHITECTURE.md 12.10, P6-B): the mock, unless `VITE_API=http` asks for
 * the server, chosen like `api/index.ts`. The mock keeps the open bookings in memory so
 * offline mode can book, list and end; the http client parses every response with the
 * shared schemas and sends the access token as the Bearer [REDACTED]
 */
export interface BookingsApi {
  listOpen(): Promise<BookingData[]>;
  create(input: BookingCreateData): Promise<BookingData>;
  end(id: string): Promise<void>;
}

export class MockBookingsApi implements BookingsApi {
  private readonly bookings: BookingData[] = [];

  async listOpen(): Promise<BookingData[]> {
    return this.bookings.filter((booking) => booking.status === "open");
  }

  async create(input: BookingCreateData): Promise<BookingData> {
    const created = BookingCreate.parse(input);
    if (created.zoneId === null) {
      throw new ApiError(400, "bad_request", "virtual meetings are not available yet");
    }
    if (!isBookableZone(created.zoneId)) {
      throw new ApiError(400, "bad_request", `zone ${created.zoneId} cannot be booked`);
    }
    const busy = this.bookings.some(
      (item) => item.zoneId === created.zoneId && item.status === "open",
    );
    if (busy) {
      throw new ApiError(409, "room_busy", `zone ${created.zoneId} already has an open booking`);
    }
    const booking = Booking.parse({
      id: crypto.randomUUID(),
      workspaceId: WORKSPACE_ID,
      zoneId: created.zoneId,
      title: created.title,
      agenda: created.agenda,
      hostId: useMe.getState().name,
      inviteeIds: created.inviteeIds,
      status: "open",
      createdAt: Date.now(),
      endedAt: null,
    });
    this.bookings.push(booking);
    return booking;
  }

  async end(id: string): Promise<void> {
    const booking = this.bookings.find((item) => item.id === id);
    if (!booking) {
      throw new ApiError(404, "not_found", `unknown booking ${id}`);
    }
    booking.status = "ended";
    booking.endedAt = Date.now();
  }
}

export interface BookingsHttpOptions {
  baseUrl?: string;
  getToken?: () => Promise<string | null>;
}

export function createHttpBookingsApi(options: BookingsHttpOptions = {}): BookingsApi {
  const raw = options.baseUrl ?? import.meta.env.VITE_SERVER_URL?.trim();
  const baseUrl = raw ? raw : "http://localhost:2567";
  const getToken = options.getToken ?? getAuthToken;

  async function request(path: string, init: { method: string; body?: unknown }): Promise<unknown> {
    const token = await getToken();
    const headers: Record<string, string> = {};
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    let payload: string | undefined;
    if (init.body !== undefined) {
      headers["Content-Type"] = "application/json";
      payload = JSON.stringify(init.body);
    }
    let response: Response;
    try {
      response = await fetch(`${baseUrl}${path}`, {
        method: init.method,
        headers,
        body: payload,
      });
    } catch {
      throw new ApiError(0, "network", "could not reach the server");
    }
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    if (!response.ok) {
      const envelope = body as { error?: unknown; message?: unknown } | null;
      throw new ApiError(
        response.status,
        typeof envelope?.error === "string" ? envelope.error : `http_${response.status}`,
        typeof envelope?.message === "string" ? envelope.message : `request failed (${response.status})`,
      );
    }
    return body;
  }

  return {
    listOpen: async () =>
      BookingList.parse(await request("/bookings?status=open", { method: "GET" })).bookings,

    create: async (input: BookingCreateData) =>
      Booking.parse(
        await request("/bookings", { method: "POST", body: BookingCreate.parse(input) }),
      ),

    end: async (id: string) => {
      await request(`/bookings/${encodeURIComponent(id)}/end`, { method: "POST" });
    },
  };
}

export function createMockBookingsApi(): BookingsApi {
  return new MockBookingsApi();
}

export const bookingsApi: BookingsApi =
  import.meta.env.VITE_API === "http" ? createHttpBookingsApi() : createMockBookingsApi();
