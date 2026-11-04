import { WORKSPACE_ID, type AuthClaims } from "@office/shared";
import { describe, expect, it } from "vitest";
import { NotFoundError } from "../db/repo.js";
import {
  BookingForbiddenError,
  BookingValidationError,
  RoomBusyError,
  createInMemoryBookingStore,
} from "./store.js";

const MAYA: AuthClaims = { userId: "dev-maya", name: "Maya", workspaceId: WORKSPACE_ID };
const ARJUN: AuthClaims = { userId: "dev-arjun", name: "Arjun", workspaceId: WORKSPACE_ID };
const FOREIGN: AuthClaims = { userId: "dev-maya", name: "Maya", workspaceId: "other-workspace" };

const ACME = { zoneId: "acme_room", title: "Acme sync", agenda: "Q3 review", inviteeIds: ["dev-arjun"] };

describe("in-memory booking store", () => {
  it("creates an open booking stamped with the host", async () => {
    const store = createInMemoryBookingStore();
    const booking = await store.create(MAYA, ACME);
    expect(booking).toMatchObject({
      workspaceId: WORKSPACE_ID,
      zoneId: "acme_room",
      title: "Acme sync",
      agenda: "Q3 review",
      hostId: "dev-maya",
      inviteeIds: ["dev-arjun"],
      status: "open",
      endedAt: null,
    });
    expect(booking.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("refuses a second open booking per zone, and frees it on end", async () => {
    const store = createInMemoryBookingStore();
    const first = await store.create(MAYA, ACME);
    await expect(store.create(ARJUN, ACME)).rejects.toBeInstanceOf(RoomBusyError);
    await expect(store.create(ARJUN, { ...ACME, zoneId: "project_room" })).resolves.toBeTruthy();
    await store.end(MAYA, first.id);
    await expect(store.create(ARJUN, ACME)).resolves.toMatchObject({ status: "open" });
  });

  it("refuses zones that cannot be booked and virtual meetings", async () => {
    const store = createInMemoryBookingStore();
    await expect(store.create(MAYA, { ...ACME, zoneId: "tea_point" })).rejects.toBeInstanceOf(
      BookingValidationError,
    );
    await expect(store.create(MAYA, { ...ACME, zoneId: null })).rejects.toBeInstanceOf(
      BookingValidationError,
    );
  });

  it("reads one booking, scoped to the workspace", async () => {
    const store = createInMemoryBookingStore();
    const booking = await store.create(MAYA, ACME);
    await expect(store.get(MAYA, booking.id)).resolves.toMatchObject({ id: booking.id });
    await expect(store.get(MAYA, "00000000-0000-4000-8000-000000000000")).resolves.toBeNull();
    await expect(store.get(FOREIGN, booking.id)).resolves.toBeNull();
  });

  it("lists the open bookings of the workspace, oldest first", async () => {
    const store = createInMemoryBookingStore();
    const acme = await store.create(MAYA, ACME);
    await store.create(MAYA, { ...ACME, zoneId: "project_room" });
    await store.end(MAYA, acme.id);
    const open = await store.listOpen(MAYA);
    expect(open.map((booking) => booking.zoneId)).toEqual(["project_room"]);
    await expect(store.listOpen(FOREIGN)).resolves.toEqual([]);
  });

  it("ends host-only, and reports unknown bookings", async () => {
    const store = createInMemoryBookingStore();
    const booking = await store.create(MAYA, ACME);
    await expect(store.end(ARJUN, booking.id)).rejects.toBeInstanceOf(BookingForbiddenError);
    await expect(store.end(MAYA, "00000000-0000-4000-8000-000000000000")).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(store.end(FOREIGN, booking.id)).rejects.toBeInstanceOf(NotFoundError);
    await store.end(MAYA, booking.id);
    await expect(store.get(MAYA, booking.id)).resolves.toMatchObject({ status: "ended" });
    await store.end(MAYA, booking.id);
  });
});
