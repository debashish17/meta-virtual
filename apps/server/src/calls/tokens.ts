import {
  CallTokenResponse,
  ZONES,
  type AuthClaims,
  type ZoneType,
} from "@office/shared";
import { AccessToken } from "livekit-server-sdk";
import type { Env } from "../env.js";
import { getRoom } from "../room/rooms.js";

/**
 * The call service (ARCHITECTURE.md 12.9): `POST /calls/token` hands a caller a LiveKit token
 * for the meeting-room zone their avatar is standing in right now. Presence comes from the
 * office room's live state through the registry; the client's zone claim is never trusted.
 * With no `LIVEKIT_*` set every live path is guarded off and the office works as before.
 */

/** Call tokens live for one hour. */
export const CALL_TOKEN_TTL_SECONDS = 3600;

/** Only these zone types can hold a call; the kitchen and the open plan cannot. */
const CALLABLE_ZONE_TYPES: readonly ZoneType[] = ["meeting_room", "customer_room", "project_room"];

/** Live calls are not configured: the endpoint answers 503 `calls_off`. */
export class CallsOffError extends Error {
  constructor() {
    super("calls are not configured");
    this.name = "CallsOffError";
  }
}

/** The caller may not call from that zone: the endpoint answers 403. */
export class CallForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CallForbiddenError";
  }
}

/** True only when the URL, the API key and the secret are all set. */
export function callsEnabled(env: Env): boolean {
  return Boolean(env.LIVEKIT_URL && env.LIVEKIT_API_KEY && env.LIVEKIT_API_SECRET);
}

/** One LiveKit room per meeting-room zone per workspace. */
export function liveKitRoomName(workspaceId: string, zoneId: string): string {
  return `${workspaceId}--${zoneId}`;
}

/**
 * The zone of a player's live avatar, or null when they are not connected. Tests inject a
 * stub; the route uses the registry.
 */
export type PlayerZoneLookup = (workspaceId: string, userId: string) => string | null;

/** The zone from the office room's own state: `""` (no zone) reads as not there. */
export function livePlayerZone(workspaceId: string, userId: string): string | null {
  const room = getRoom(workspaceId);
  if (!room) {
    return null;
  }
  for (const player of room.state.players.values()) {
    if (player.userId === userId) {
      return player.zoneId || null;
    }
  }
  return null;
}

export interface CallTokenArgs {
  env: Env;
  claims: AuthClaims;
  zoneId: string;
  playerZone?: PlayerZoneLookup;
}

/**
 * Issues `{ url, token }` for the caller's zone: identity is the user id, name the display
 * name, and the grant is join, publish and subscribe for that one LiveKit room. Throws
 * `CallsOffError` without keys, `CallForbiddenError` unless the caller is in a callable
 * zone of that id right now.
 */
export async function issueCallToken({
  env,
  claims,
  zoneId,
  playerZone = livePlayerZone,
}: CallTokenArgs): Promise<{ url: string; token: string }> {
  if (!callsEnabled(env)) {
    throw new CallsOffError();
  }
  const zone = ZONES.find((candidate) => candidate.id === zoneId);
  if (!zone || !CALLABLE_ZONE_TYPES.includes(zone.type)) {
    throw new CallForbiddenError(`zone ${zoneId} cannot hold a call`);
  }
  if (playerZone(claims.workspaceId, claims.userId) !== zoneId) {
    throw new CallForbiddenError(`caller is not in zone ${zoneId}`);
  }
  const access = new AccessToken(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET, {
    identity: claims.userId,
    name: claims.name,
    ttl: CALL_TOKEN_TTL_SECONDS,
  });
  access.addGrant({
    roomJoin: true,
    room: liveKitRoomName(claims.workspaceId, zoneId),
    canPublish: true,
    canSubscribe: true,
  });
  return CallTokenResponse.parse({ url: env.LIVEKIT_URL, token: await access.toJwt() });
}
