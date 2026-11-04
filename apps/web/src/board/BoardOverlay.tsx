import { useEffect, useRef, useState } from "react";
import type { BoardPin } from "@office/shared";
import { boardApi, type BoardApi } from "../api/board.js";
import { ApiError } from "../api/http.js";
import { useMe } from "../office/me.js";
import { useBoard, useBoardStore, useBoardUi } from "./store.js";
import "./board.css";

/**
 * The company board (ARCHITECTURE.md 12.10, P6-D): pins as sticky notes in the
 * notes palette, opened from a click on the cork board or the ideas wall.
 * Anyone in the workspace pins; only the author removes (the server answers
 * 403 otherwise). Pinning broadcasts `records_changed board`, so the other
 * browser and the cork-board texture refresh live.
 */

export interface BoardOverlayDeps {
  api?: BoardApi;
}

/** Sticky-note colours, the notes palette's cream and oak family. */
export const BOARD_COLORS = [
  { name: "yellow", value: "#fbe7a1" },
  { name: "pink", value: "#f4c2cd" },
  { name: "green", value: "#cde6b8" },
  { name: "blue", value: "#bdd7f2" },
  { name: "cream", value: "#f6dfb8" },
] as const;

function formatTime(createdAt: number): string {
  return new Date(createdAt).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function BoardOverlay({ deps }: { deps?: BoardOverlayDeps }) {
  const api = deps?.api ?? boardApi;
  const open = useBoardUi((state) => state.open);
  const close = useBoardUi((state) => state.setOpen);
  const pins = useBoard(api);
  const ownName = useMe((state) => state.name);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [newText, setNewText] = useState("");
  const [newColor, setNewColor] = useState<string>(BOARD_COLORS[0].value);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  if (!open) {
    return null;
  }

  async function reload(): Promise<void> {
    await useBoardStore.getState().load(api).catch(() => undefined);
  }

  async function pin(): Promise<void> {
    const text = newText.trim();
    if (!text || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.create({ text, color: newColor });
      setNewText("");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "could not pin that");
    } finally {
      setBusy(false);
    }
  }

  async function remove(item: BoardPin): Promise<void> {
    setError(null);
    try {
      await api.remove(item.id);
      await reload();
    } catch (err) {
      if (err instanceof ApiError && err.code === "forbidden") {
        setError(`Only ${item.authorName} can remove this pin.`);
      } else {
        setError(err instanceof Error ? err.message : "could not remove that pin");
      }
      await reload();
    }
  }

  return (
    <div className="board-backdrop" onClick={() => close(false)}>
      <div
        className="board-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Company board"
        data-testid="board-overlay"
        onClick={(event) => event.stopPropagation()}
      >
        <header>
          <h2>Company board</h2>
          <button
            ref={closeRef}
            type="button"
            className="board-close"
            onClick={() => close(false)}
            aria-label="Close"
          >
            ×
          </button>
        </header>

        <form
          className="board-add"
          aria-label="Pin to the board"
          onSubmit={(event) => {
            event.preventDefault();
            void pin();
          }}
        >
          <textarea
            aria-label="New pin"
            value={newText}
            rows={2}
            maxLength={2000}
            placeholder="Pin something worth remembering…"
            onChange={(event) => setNewText(event.target.value)}
          />
          <div className="board-add-row">
            <div className="board-colors" role="radiogroup" aria-label="Colour">
              {BOARD_COLORS.map((color) => (
                <label
                  key={color.value}
                  className={color.value === newColor ? "board-dot on" : "board-dot"}
                  style={{ background: color.value }}
                  title={color.name}
                >
                  <input
                    type="radio"
                    name="new-pin-colour"
                    value={color.value}
                    checked={color.value === newColor}
                    onChange={() => setNewColor(color.value)}
                    aria-label={color.name}
                  />
                </label>
              ))}
            </div>
            <button
              type="submit"
              className="pan-btn pan-btn-primary"
              disabled={newText.trim() === "" || busy}
            >
              Pin it
            </button>
          </div>
        </form>

        {error && (
          <p className="pan-error" role="alert">
            {error}
          </p>
        )}
        {pins.length === 0 && (
          <p className="pan-muted">No pins yet. The whole workspace sees what you pin.</p>
        )}

        <ul className="board-list">
          {pins.map((item) => (
            <li key={item.id} className="board-pin" style={{ background: item.color }}>
              <p className="board-pin-text">{item.text}</p>
              <span className="board-pin-meta">
                {item.authorName} · {formatTime(item.createdAt)}
              </span>
              {item.authorName === ownName && (
                <span className="board-pin-actions">
                  <button
                    type="button"
                    className="pan-btn"
                    aria-label={`Remove: ${item.text}`}
                    onClick={() => void remove(item)}
                  >
                    Remove
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>
        <p className="board-foot">Click the cork board or the ideas wall to come back here.</p>
      </div>
    </div>
  );
}
