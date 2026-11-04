import { useEffect, useState } from "react";
import type { Note } from "@office/shared";
import { notesApi, type NotesApi } from "../api/notes.js";
import "./notes.css";

/**
 * Personal notes (ARCHITECTURE.md 12.10, P6-C): add, edit, tick done, delete,
 * a colour per note. Private to the author; notes reload from whichever api
 * (mock or http) the build chose, so with the http api they survive reloads.
 * No broadcast: the panel refetches after its own writes only.
 */

export interface NotesPanelDeps {
  api?: NotesApi;
}

/** Sticky-note colours in the panel palette's cream and oak family. */
export const NOTE_COLORS = [
  { name: "yellow", value: "#fbe7a1" },
  { name: "pink", value: "#f4c2cd" },
  { name: "green", value: "#cde6b8" },
  { name: "blue", value: "#bdd7f2" },
  { name: "cream", value: "#f6dfb8" },
] as const;

interface Editing {
  id: string;
  text: string;
  color: string;
}

function ColorDots({
  group,
  value,
  onPick,
}: {
  group: string;
  value: string;
  onPick: (color: string) => void;
}) {
  return (
    <div className="pan-notes-colors" role="radiogroup" aria-label="Colour">
      {NOTE_COLORS.map((color) => (
        <label
          key={color.value}
          className={color.value === value ? "pan-notes-dot on" : "pan-notes-dot"}
          style={{ background: color.value }}
          title={color.name}
        >
          <input
            type="radio"
            name={group}
            value={color.value}
            checked={color.value === value}
            onChange={() => onPick(color.value)}
            aria-label={color.name}
          />
        </label>
      ))}
    </div>
  );
}

export default function NotesPanel({ deps }: { deps?: NotesPanelDeps }) {
  const api = deps?.api ?? notesApi;
  const [notes, setNotes] = useState<Note[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newText, setNewText] = useState("");
  const [newColor, setNewColor] = useState<string>(NOTE_COLORS[0].value);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    api
      .list()
      .then((list) => {
        if (live) {
          setNotes(list);
          setLoaded(true);
        }
      })
      .catch((err: unknown) => {
        if (live) {
          setError(err instanceof Error ? err.message : "could not load the notes");
          setLoaded(true);
        }
      });
    return () => {
      live = false;
    };
  }, [api]);

  async function add(): Promise<void> {
    const text = newText.trim();
    if (!text || busy) return;
    setBusy(true);
    setError(null);
    try {
      const note = await api.create({ text, color: newColor });
      setNotes((current) => [...current, note]);
      setNewText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "could not add the note");
    } finally {
      setBusy(false);
    }
  }

  async function toggle(note: Note): Promise<void> {
    setError(null);
    try {
      const updated = await api.update(note.id, { done: !note.done });
      setNotes((current) => current.map((item) => (item.id === note.id ? updated : item)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "could not update the note");
    }
  }

  async function save(): Promise<void> {
    if (!editing || busy) return;
    const text = editing.text.trim();
    if (!text) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await api.update(editing.id, { text, color: editing.color });
      setNotes((current) => current.map((item) => (item.id === editing.id ? updated : item)));
      setEditing(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "could not update the note");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string): Promise<void> {
    setError(null);
    try {
      await api.remove(id);
      setNotes((current) => current.filter((item) => item.id !== id));
      setEditing((current) => (current?.id === id ? null : current));
    } catch (err) {
      setError(err instanceof Error ? err.message : "could not delete the note");
    }
  }

  return (
    <div className="pan-notes" data-testid="notes-panel">
      <form
        className="pan-notes-add"
        aria-label="Add a note"
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
      >
        <textarea
          aria-label="New note"
          value={newText}
          rows={2}
          maxLength={2000}
          placeholder="Jot something down…"
          onChange={(e) => setNewText(e.target.value)}
        />
        <div className="pan-notes-add-row">
          <ColorDots group="new-note-colour" value={newColor} onPick={setNewColor} />
          <button
            type="submit"
            className="pan-btn pan-btn-primary"
            disabled={newText.trim() === "" || busy}
          >
            Add note
          </button>
        </div>
      </form>

      {error && (
        <p className="pan-error" role="alert">
          {error}
        </p>
      )}
      {loaded && notes.length === 0 && (
        <p className="pan-muted">No notes yet. They stay private to you.</p>
      )}

      <ul className="pan-notes-list">
        {notes.map((note) =>
          editing?.id === note.id ? (
            <li
              key={note.id}
              className={note.done ? "pan-note done" : "pan-note"}
              style={{ background: editing.color }}
            >
              <textarea
                aria-label="Edit note"
                value={editing.text}
                rows={2}
                maxLength={2000}
                onChange={(e) => setEditing({ ...editing, text: e.target.value })}
              />
              <div className="pan-notes-add-row">
                <ColorDots
                  group={`edit-note-colour-${note.id}`}
                  value={editing.color}
                  onPick={(color) => setEditing({ ...editing, color })}
                />
                <span className="pan-notes-actions">
                  <button
                    type="button"
                    className="pan-btn pan-btn-primary"
                    disabled={editing.text.trim() === "" || busy}
                    onClick={() => void save()}
                  >
                    Save
                  </button>
                  <button type="button" className="pan-btn" onClick={() => setEditing(null)}>
                    Cancel
                  </button>
                </span>
              </div>
            </li>
          ) : (
            <li
              key={note.id}
              className={note.done ? "pan-note done" : "pan-note"}
              style={{ background: note.color }}
            >
              <label className="pan-note-tick">
                <input
                  type="checkbox"
                  checked={note.done}
                  onChange={() => void toggle(note)}
                  aria-label={note.done ? `Mark not done: ${note.text}` : `Mark done: ${note.text}`}
                />
              </label>
              <p className="pan-note-text">{note.text}</p>
              <span className="pan-notes-actions">
                <button
                  type="button"
                  className="pan-btn"
                  aria-label={`Edit: ${note.text}`}
                  onClick={() =>
                    setEditing({ id: note.id, text: note.text, color: note.color })
                  }
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="pan-btn"
                  aria-label={`Delete: ${note.text}`}
                  onClick={() => void remove(note.id)}
                >
                  Delete
                </button>
              </span>
            </li>
          ),
        )}
      </ul>
    </div>
  );
}
