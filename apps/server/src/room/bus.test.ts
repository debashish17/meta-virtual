import { describe, expect, it } from "vitest";
import { RegistryBus, StubBus } from "./bus.js";
import { registerRoom, unregisterRoom } from "./rooms.js";
import type { OfficeRoom } from "./office.room.js";

const invite = {
  bookingId: "00000000-0000-4000-8000-000000000051",
  zoneId: "acme_room",
  title: "Acme sync",
  hostName: "Maya",
};

describe("room bus", () => {
  it("records meeting invites on the stub", () => {
    const bus = new StubBus();
    bus.meetingInvite("w", ["u1"], invite);
    expect(bus.invites).toEqual([{ workspaceId: "w", userIds: ["u1"], payload: invite }]);
  });

  it("is a no-op when the workspace has no live room", () => {
    const bus = new RegistryBus();
    expect(() => bus.meetingInvite("no-such-workspace", ["u1"], invite)).not.toThrow();
    expect(() => bus.recordsChanged("no-such-workspace", ["tasks"])).not.toThrow();
  });

  it("delivers invites through the registered room", () => {
    const sent: { userIds: readonly string[]; payload: typeof invite }[] = [];
    const room = {
      sendMeetingInvite: (userIds: readonly string[], payload: typeof invite) => {
        sent.push({ userIds, payload });
      },
    } as unknown as OfficeRoom;
    registerRoom("w", room);
    try {
      new RegistryBus().meetingInvite("w", ["u1", "u2"], invite);
    } finally {
      unregisterRoom("w", room);
    }
    expect(sent).toEqual([{ userIds: ["u1", "u2"], payload: invite }]);
  });
});
