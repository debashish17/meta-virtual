import type { BoardPin } from "@office/shared";

/**
 * Paints the newest board pins onto a canvas for the cork-board texture, the way the
 * wall displays paint their screens. The board is a glanceable cluster of sticky
 * notes — short text plus the author — because a 1.2 m board covers only a small
 * patch of pixels at the default walking zoom; the overlay carries the full pins.
 */

export const BOARD_W = 1024;
export const BOARD_H = 768;
/** How many pins the cork board shows; the overlay lists them all. */
export const BOARD_TEXTURE_MAX = 6;

const CORK = "#b98a5e";
const CORK_DARK = "#a1764f";
const INK = "#1e2126";
const FONT = "system-ui, -apple-system, sans-serif";

export interface PlacedPin {
  pin: BoardPin;
  /** Notes across and down, and the tilt in radians. */
  col: number;
  row: number;
  tilt: number;
}

/**
 * The newest pins in reading order, newest first, tilted like stuck notes. Pure,
 * so the overlay and the texture agree on what "newest" means.
 */
export function layoutBoardPins(pins: readonly BoardPin[], max = BOARD_TEXTURE_MAX): PlacedPin[] {
  const newest = [...pins].sort((a, b) => b.createdAt - a.createdAt).slice(0, Math.max(0, max));
  return newest.map((pin, i) => ({
    pin,
    col: i % 2,
    row: Math.floor(i / 2),
    tilt: [-0.05, 0.04, 0.06, -0.04, 0.03, -0.06][i] ?? 0,
  }));
}

/** Redraw the canvas only when this changes. */
export function boardHash(pins: readonly BoardPin[]): string {
  return JSON.stringify(
    layoutBoardPins(pins).map((placed) => [placed.pin.id, placed.pin.text, placed.pin.color, placed.pin.authorName]),
  );
}

function wrapLines(
  g: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const words = text.split(/\s+/).filter((word) => word.length > 0);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line === "" ? word : `${line} ${word}`;
    if (g.measureText(next).width <= maxWidth || line === "") {
      line = next;
    } else {
      lines.push(line);
      if (lines.length === maxLines) return lines;
      line = word;
    }
  }
  if (line !== "" && lines.length < maxLines) lines.push(line);
  return lines;
}

export function drawBoard(canvas: HTMLCanvasElement, pins: readonly BoardPin[]): void {
  const g = canvas.getContext("2d");
  if (!g) return;
  const placed = layoutBoardPins(pins);

  g.fillStyle = CORK;
  g.fillRect(0, 0, BOARD_W, BOARD_H);
  g.fillStyle = CORK_DARK;
  g.fillRect(0, 0, BOARD_W, 14);
  g.fillRect(0, BOARD_H - 14, BOARD_W, 14);

  if (placed.length === 0) {
    g.font = `400 44px ${FONT}`;
    g.fillStyle = "rgba(30, 33, 38, 0.65)";
    g.textAlign = "center";
    g.fillText("Pin something worth remembering", BOARD_W / 2, BOARD_H / 2);
    g.textAlign = "left";
    return;
  }

  const gap = 36;
  const noteW = (BOARD_W - gap * 3) / 2;
  const noteH = (BOARD_H - gap * 4) / 3;
  for (const { pin, col, row, tilt } of placed) {
    const x = gap + col * (noteW + gap);
    const y = gap + row * (noteH + gap);
    g.save();
    g.translate(x + noteW / 2, y + noteH / 2);
    g.rotate(tilt);
    g.translate(-noteW / 2, -noteH / 2);
    g.fillStyle = "rgba(30, 33, 38, 0.25)";
    g.fillRect(8, 10, noteW, noteH);
    g.fillStyle = pin.color;
    g.fillRect(0, 0, noteW, noteH);
    g.fillStyle = INK;
    g.font = `400 38px ${FONT}`;
    const lines = wrapLines(g, pin.text, noteW - 44, 3);
    lines.forEach((line, i) => g.fillText(line, 22, 62 + i * 48));
    g.font = `600 30px ${FONT}`;
    g.fillStyle = "rgba(30, 33, 38, 0.7)";
    g.fillText(pin.authorName, 22, noteH - 20);
    g.restore();
  }
}
