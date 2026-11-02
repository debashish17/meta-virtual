import { CaptionSend, CLIENT_MESSAGE } from "@office/shared";

/** The room surface captions need; the office room satisfies it structurally. */
export interface CaptionSenderRoom {
  send(type: string, message: unknown): void;
}

/**
 * Send one recognizer segment over the office room as `caption_send`. Blank text is
 * dropped (false) so interim cleanups never reach the server; anything else is parsed
 * with the shared schema before it goes on the wire.
 */
export function sendCaption(room: CaptionSenderRoom, text: string, final: boolean): boolean {
  const trimmed = text.trim();
  if (trimmed.length === 0) return false;
  const payload = CaptionSend.parse({ text: trimmed, final, ts: Date.now() });
  room.send(CLIENT_MESSAGE.captionSend, payload);
  return true;
}
