import type { OfficeRoom } from "./office.room.js";

/**
 * The room registry (ARCHITECTURE.md 12.2): one live `OfficeRoom` per workspace. The room
 * registers itself on its first join and removes itself on dispose, so the HTTP API can
 * broadcast `records_changed` to the right room through `RegistryBus` (bus.ts). One process,
 * so a plain map is the whole bus.
 */
const rooms = new Map<string, OfficeRoom>();

export function registerRoom(workspaceId: string, room: OfficeRoom): void {
  rooms.set(workspaceId, room);
}

export function unregisterRoom(workspaceId: string | null, room: OfficeRoom): void {
  if (workspaceId !== null && rooms.get(workspaceId) === room) {
    rooms.delete(workspaceId);
  }
}

export function getRoom(workspaceId: string): OfficeRoom | undefined {
  return rooms.get(workspaceId);
}
