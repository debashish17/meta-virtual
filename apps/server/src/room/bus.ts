import { SERVER_MESSAGE, type RecordKind } from "@office/shared";
import { getRoom } from "./rooms.js";

/**
 * How the HTTP API tells the office that records changed (ARCHITECTURE.md 12.2): after a
 * commit, outside the transaction, the API calls `recordsChanged` and the workspace's room
 * broadcasts `records_changed` so clients refetch.
 */
export interface RoomBus {
  recordsChanged(workspaceId: string, kinds: RecordKind[]): void;
}

export class StubBus implements RoomBus {
  readonly calls: { workspaceId: string; kinds: RecordKind[] }[] = [];

  recordsChanged(workspaceId: string, kinds: RecordKind[]): void {
    this.calls.push({ workspaceId, kinds });
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
}
