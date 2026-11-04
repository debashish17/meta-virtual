import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { Booking, BookingList, type MeetingInvite } from "@office/shared";
import { afterEach, describe, expect, it } from "vitest";
import { buildDeps } from "../deps.js";
import { loadEnv } from "../env.js";
import { httpRoutes } from "../http/routes.js";
import { StubBus } from "../room/bus.js";

const MAYA = { Authorization: "Bearer dev:Maya" };
const ARJUN = { Authorization: "Bearer dev:Arjun" };

const ACME = {
  zoneId: "acme_room",
  title: "Acme sync",
  agenda: "Q3 review",
  inviteeIds: ["dev-arjun"],
};

const servers: Server[] = [];
afterEach(async () => {
  while (servers.length > 0) {
    const server = servers.pop()!;
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

async function boot(): Promise<{ base: string; bus: StubBus }> {
  const bus = new StubBus();
  const app = express();
  app.use(express.json());
  httpRoutes(app, { ...buildDeps(loadEnv({})), bus });
  const server = app.listen(0, "127.0.0.1");
  servers.push(server);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const { port } = server.address() as AddressInfo;
  return { base: `http://127.0.0.1:${port}`, bus };
}

async function createBooking(base: string, auth: Record<string, string>, body: unknown) {
  return fetch(`${base}/bookings`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("bookings routes", () => {
  it("needs a valid access token", async () => {
    const { base } = await boot();
    expect(await (await fetch(`${base}/bookings?status=open`)).status).toBe(401);
  });

  it("creates, invites and broadcasts", async () => {
    const { base, bus } = await boot();
    const res = await createBooking(base, MAYA, ACME);
    expect(res.status).toBe(201);
    const booking = Booking.parse(await res.json());
    expect(booking).toMatchObject({ zoneId: "acme_room", title: "Acme sync", status: "open" });

    expect(bus.invites).toHaveLength(1);
    const invite = bus.invites[0]!;
    expect(invite.userIds).toEqual(["dev-arjun"]);
    const payload = invite.payload as MeetingInvite;
    expect(payload).toMatchObject({ bookingId: booking.id, zoneId: "acme_room", title: "Acme sync", hostName: "Maya" });
    expect(bus.calls).toEqual([{ workspaceId: booking.workspaceId, kinds: ["bookings"] }]);
  });

  it("answers 409 room_busy for a booked room", async () => {
    const { base } = await boot();
    expect((await createBooking(base, MAYA, ACME)).status).toBe(201);
    const res = await createBooking(base, ARJUN, { ...ACME, inviteeIds: ["dev-maya"] });
    expect(res.status).toBe(409);
    expect((await res.json()) as { error: string }).toMatchObject({ error: "room_busy" });
  });

  it("answers 400 for a zone that cannot be booked", async () => {
    const { base } = await boot();
    const res = await createBooking(base, MAYA, { ...ACME, zoneId: "tea_point" });
    expect(res.status).toBe(400);
    const virtual = await createBooking(base, MAYA, { ...ACME, zoneId: null });
    expect(virtual.status).toBe(400);
  });

  it("answers 400 for an invitee outside the workspace", async () => {
    const { base } = await boot();
    const res = await createBooking(base, MAYA, { ...ACME, inviteeIds: ["dev-mallory"] });
    expect(res.status).toBe(400);
  });

  it("ends host-only, frees the room and broadcasts", async () => {
    const { base, bus } = await boot();
    const booking = Booking.parse(await (await createBooking(base, MAYA, ACME)).json());

    const forbidden = await fetch(`${base}/bookings/${booking.id}/end`, {
      method: "POST",
      headers: ARJUN,
    });
    expect(forbidden.status).toBe(403);

    const ended = await fetch(`${base}/bookings/${booking.id}/end`, {
      method: "POST",
      headers: MAYA,
    });
    expect(ended.status).toBe(200);
    expect(bus.calls.at(-1)).toEqual({ workspaceId: booking.workspaceId, kinds: ["bookings"] });

    const again = await createBooking(base, ARJUN, { ...ACME, inviteeIds: ["dev-maya"] });
    expect(again.status).toBe(201);
  });

  it("lists the open bookings", async () => {
    const { base } = await boot();
    const booking = Booking.parse(await (await createBooking(base, MAYA, ACME)).json());
    await createBooking(base, MAYA, { ...ACME, zoneId: "project_room" });
    await fetch(`${base}/bookings/${booking.id}/end`, { method: "POST", headers: MAYA });

    const res = await fetch(`${base}/bookings?status=open`, { headers: MAYA });
    expect(res.status).toBe(200);
    const list = BookingList.parse(await res.json());
    expect(list.bookings.map((item) => item.zoneId)).toEqual(["project_room"]);

    const bad = await fetch(`${base}/bookings?status=ended`, { headers: MAYA });
    expect(bad.status).toBe(400);
  });
});
