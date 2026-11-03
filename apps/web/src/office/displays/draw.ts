import type { ScreenData } from "./screens";

/**
 * Paints a `ScreenData` onto a canvas for the TV texture. The 3D screen is a glanceable
 * summary — the title plus one big line per section — because a 1.2 m TV covers only about
 * 70 px at the default walking zoom; the DOM overlay carries the full sections. Type is as
 * large as fits so the summary reads at a close wheel zoom.
 */

export const SCREEN_W = 1024;
export const SCREEN_H = 640;

const BG = "#0d1218";
const INK = "#f2f5f8";
const MUTED = "#9aa3ad";
const ACCENT = "#d99a4e";
const TONE = { ok: "#58b368", warn: "#e0a458" } as const;
const FONT = "system-ui, -apple-system, sans-serif";

function ellipsis(g: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (g.measureText(text).width <= maxWidth) return text;
  let kept = text;
  while (kept.length > 1 && g.measureText(`${kept}…`).width > maxWidth) {
    kept = kept.slice(0, -1);
  }
  return `${kept}…`;
}

/** The largest size between min and start that fits maxWidth. */
function fitFont(g: CanvasRenderingContext2D, text: string, maxWidth: number, start: number, min: number, weight: number): number {
  let size = start;
  g.font = `${weight} ${size}px ${FONT}`;
  while (size > min && g.measureText(text).width > maxWidth) {
    size -= 4;
    g.font = `${weight} ${size}px ${FONT}`;
  }
  return size;
}

export function drawScreen(canvas: HTMLCanvasElement, data: ScreenData): void {
  const g = canvas.getContext("2d");
  if (!g) return;
  const pad = 48;
  const inner = SCREEN_W - pad * 2;

  g.fillStyle = BG;
  g.fillRect(0, 0, SCREEN_W, SCREEN_H);
  g.fillStyle = TONE[data.tone];
  g.fillRect(0, 0, SCREEN_W, 10);

  // Title, one line, shrunk to fit.
  const titleSize = fitFont(g, data.title, inner - 90, 100, 56, 700);
  g.fillStyle = INK;
  g.textBaseline = "alphabetic";
  g.fillText(ellipsis(g, data.title, inner - 90), pad, pad + titleSize * 0.9);

  // Status dot, top right.
  g.beginPath();
  g.arc(SCREEN_W - pad - 24, pad + 36, 24, 0, Math.PI * 2);
  g.fillStyle = TONE[data.tone];
  g.fill();

  g.strokeStyle = "#2a333d";
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(pad, pad + 128);
  g.lineTo(SCREEN_W - pad, pad + 128);
  g.stroke();

  // When extra sections exist (today: the latest receipts), the glance rows shrink to two
  // so the extras fit below; otherwise the layout is exactly as before.
  const glance = data.sections.slice(0, data.sections.length > 3 ? 2 : 3);

  // One glance row per section: heading plus the first line, on one line.
  let y = pad + 128 + 84;
  for (const section of glance) {
    const label = `${section.heading.toUpperCase()}  `;
    g.font = `600 34px ${FONT}`;
    g.fillStyle = ACCENT;
    g.fillText(label, pad, y);
    const valueX = pad + g.measureText(label).width;
    const value = section.lines[0] ?? "—";
    const avail = inner - (valueX - pad) - (section.lines.length > 1 ? 70 : 0);
    fitFont(g, value, avail, 72, 44, 700);
    const shown = ellipsis(g, value, avail);
    g.fillStyle = INK;
    g.fillText(shown, valueX, y);
    if (section.lines.length > 1) {
      g.font = `600 30px ${FONT}`;
      g.fillStyle = MUTED;
      g.fillText(`+${section.lines.length - 1}`, valueX + g.measureText(shown).width + 12, y);
    }
    y += 108;
  }

  // Sections past the glance rows draw as compact lines, so the canvas matches the
  // overlay without new 3D.
  const rest = data.sections
    .slice(glance.length)
    .flatMap((section) => section.lines)
    .slice(0, 2);
  if (rest.length > 0) {
    y += 8;
    g.font = `600 26px ${FONT}`;
    g.fillStyle = MUTED;
    g.fillText("LATEST RECEIPTS", pad, y);
    y += 40;
    g.font = `400 30px ${FONT}`;
    g.fillStyle = INK;
    for (const line of rest) {
      g.fillText(ellipsis(g, line, inner), pad, y);
      y += 38;
    }
  }

  g.font = `400 28px ${FONT}`;
  g.fillStyle = MUTED;
  g.fillText("Click for details", pad, SCREEN_H - 32);
}
