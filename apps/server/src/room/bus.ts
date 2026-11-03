import { SERVER_MESSAGE, type MeetingInvite, type RecordKind } from "@office/shared";
import { getRoom } from "./rooms.js";

/**
 * How the HTTP API tells the office that records changed (ARCHITECTURE.md 12.2): after a
 * commit, outside the transaction, the API calls `recordsChanged` and the workspace's room
 * broadcasts `records_changed` so clients refetch.
 */
export interface RoomBus {
  recordsChanged(workspaceId: string, kinds: RecordKind[]): void;
  /**
   * Phase 6 (P6-B): after a booking is created, deliver `meeting_invite` to the connected
   * sessions of these users. Offline invitees see the open booking in the panel instead.
   */
  meetingInvite(workspaceId: string, userIds: readonly string[], payload: MeetingInvite): void;
}

export class StubBus implements RoomBus {
  readonly calls: { workspaceId: string; kinds: RecordKind[] }[] = [];
  readonly invites: { workspaceId: string; userIds: readonly string[]; payload: MeetingInvite }[] =
    [];

  recordsChanged(workspaceId: string, kinds: RecordKind[]): void {
    this.calls.push({ workspaceId, kinds });
  }

  meetingInvite(workspaceId: string, userIds: readonly string[], payload: MeetingInvite): void {
    this.invites.push({ workspaceId, userIds, payload });
  }
}

/**
 * The live bus: it looks the workspace's room up in the registry and broadcasts
 * `records_changed` to it. A workspace with no live room (nobody online) is a no-op: there
 * is nobody to refetch. Wire it in `deps.ts` (`bus: new RegistryBus()`).
 */
export class RegistryBus implements RoomBus {
  recordsChanged(workspaceId: string, kinds: RecordKind[]): void {
    getRoom(workspaceId)?.broadcast(SERVER_MESSAGE.recordsChanged, { kinds });
  }

  meetingInvite(workspaceId: string, userIds: readonly string[], payload: MeetingInvite): void {
    getRoom(workspaceId)?.sendMeetingInvite(userIds, payload);
  }
}
