import { Caption, CaptionSend, CLIENT_MESSAGE, SERVER_MESSAGE } from "@office/shared";

/**
 * Live-call captions on the server (P5-C, ARCHITECTURE.md 12.9): each browser captions its
 * own speaker with the Web Speech API and sends the segments as `caption_send` over the
 * office room. This module broadcasts each segment as `caption` to the people in the
 * speaker's zone and appends the final ones, with the speaker's name, to a per-zone
 * transcript buffer that "End meeting" feeds to `POST /meetings` exactly as a pasted
 * transcript.
 *
 * Wiring (one line in `OfficeRoom.onCreate`, owned by the lead — see report R1):
 * `this.captions = registerCaptionHandlers(this);`
 * The returned buffer is per-room (per workspace), so zone ids never bleed across
 * workspaces. The open floor (empty zone id) shares one scope, like the rest.
 */

export const NO_SPEECH_NOTICE = "no speech was captured";

/** Interim hypotheses arrive several a second, so captions get the movement-style budget. */
export const CAPTION_RATE_MAX = 30;
export const CAPTION_RATE_WINDOW_MS = 1000;

/** Oldest segments drop off past this per zone; a meeting never grows the buffer unboundedly. */
export const TRANSCRIPT_SEGMENTS_MAX = 500;

export interface TranscriptSegment {
  name: string;
  text: string;
  ts: number;
}

/** Final segments in arrival order, one `Name: text` line each. */
export function assembleTranscript(segments: readonly TranscriptSegment[]): string {
  return segments.map((segment) => `${segment.name}: ${segment.text}`).join("\n");
}

export class TranscriptBuffer {
  private readonly zones = new Map<string, TranscriptSegment[]>();

  addFinal(zoneId: string, segment: TranscriptSegment): void {
    const kept = this.zones.get(zoneId) ?? [];
    kept.push(segment);
    if (kept.length > TRANSCRIPT_SEGMENTS_MAX) {
      kept.splice(0, kept.length - TRANSCRIPT_SEGMENTS_MAX);
    }
    this.zones.set(zoneId, kept);
  }

  transcript(zoneId: string): string {
    return assembleTranscript(this.zones.get(zoneId) ?? []);
  }

  isEmpty(zoneId: string): boolean {
    return (this.zones.get(zoneId)?.length ?? 0) === 0;
  }

  /**
   * The assembled transcript, clearing the zone; null when nothing was captured (the
   * caller then shows `NO_SPEECH_NOTICE` instead of creating a meeting).
   */
  take(zoneId: string): string | null {
    if (this.isEmpty(zoneId)) return null;
    const text = this.transcript(zoneId);
    this.zones.delete(zoneId);
    return text;
  }

  clear(zoneId: string): void {
    this.zones.delete(zoneId);
  }
}

/** The room surface the caption handler needs; `OfficeRoom` satisfies it structurally. */
export interface CaptionRoomClient {
  sessionId: string;
  send(type: string, message: unknown): void;
}

export interface CaptionRoom {
  onMessage(
    type: string,
    callback: (client: CaptionRoomClient, message: unknown) => void,
  ): void;
  readonly clients: readonly CaptionRoomClient[];
  readonly state: {
    players: {
      get(sessionId: string): { name: string; zoneId: string } | undefined;
    };
  };
}

function allow(hits: Map<string, number[]>, sessionId: string, now: number): boolean {
  if (hits.size > 2000) {
    for (const [id, bucket] of hits) {
      if (bucket.length === 0 || bucket[0] <= now - CAPTION_RATE_WINDOW_MS) hits.delete(id);
    }
  }
  const bucket = hits.get(sessionId) ?? [];
  while (bucket.length > 0 && bucket[0] <= now - CAPTION_RATE_WINDOW_MS) bucket.shift();
  if (bucket.length >= CAPTION_RATE_MAX) {
    hits.set(sessionId, bucket);
    return false;
  }
  bucket.push(now);
  hits.set(sessionId, bucket);
  return true;
}

/**
 * Handle `caption_send` on a room: parse with the shared schema (anything invalid gets
 * `invalid_message`), broadcast the parsed `caption` to the speaker's zone, and buffer
 * the final segments. Returns the room's buffer (a fresh one when omitted).
 */
export function registerCaptionHandlers(
  room: CaptionRoom,
  buffers: TranscriptBuffer = new TranscriptBuffer(),
): TranscriptBuffer {
  const hits = new Map<string, number[]>();
  room.onMessage(CLIENT_MESSAGE.captionSend, (client, message) => {
    const parsed = CaptionSend.safeParse(message);
    if (!parsed.success) {
      client.send(SERVER_MESSAGE.error, { code: "invalid_message", message: "bad caption_send" });
      return;
    }
    const player = room.state.players.get(client.sessionId);
    if (!player) return;
    if (!allow(hits, client.sessionId, Date.now())) {
      client.send(SERVER_MESSAGE.error, { code: "rate_limited", message: "too many captions" });
      return;
    }
    const caption = Caption.parse({
      name: player.name,
      text: parsed.data.text,
      final: parsed.data.final,
      ts: parsed.data.ts,
    });
    for (const other of room.clients) {
      if (room.state.players.get(other.sessionId)?.zoneId === player.zoneId) {
        other.send(SERVER_MESSAGE.caption, caption);
      }
    }
    if (parsed.data.final) {
      buffers.addFinal(player.zoneId, {
        name: player.name,
        text: parsed.data.text,
        ts: parsed.data.ts,
      });
    }
  });
  return buffers;
}
