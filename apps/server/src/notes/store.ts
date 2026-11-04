import { randomUUID } from "node:crypto";
import {
  Note,
  type AuthClaims,
  type Note as NoteData,
  type NoteCreate,
  type NoteUpdate,
} from "@office/shared";
import { NotFoundError } from "../db/repo.js";

/**
 * Personal notes (ARCHITECTURE.md 12.10, P6-C): private to their author, never
 * broadcast. Every call is scoped to the token's workspace and user id; another
 * author's note reads as missing (404), never forbidden, so its existence does
 * not leak.
 */
export interface NoteStore {
  list(claims: AuthClaims): Promise<NoteData[]>;
  create(claims: AuthClaims, input: NoteCreate): Promise<NoteData>;
  update(claims: AuthClaims, id: string, input: NoteUpdate): Promise<NoteData>;
  remove(claims: AuthClaims, id: string): Promise<void>;
}

export function createInMemoryNoteStore(): NoteStore {
  const notes = new Map<string, NoteData>();

  const owned = (claims: AuthClaims, id: string): NoteData | undefined => {
    const note = notes.get(id);
    if (!note || note.workspaceId !== claims.workspaceId || note.userId !== claims.userId) {
      return undefined;
    }
    return note;
  };

  return {
    async list(claims: AuthClaims): Promise<NoteData[]> {
      return structuredClone(
        [...notes.values()]
          .filter(
            (note) =>
              note.workspaceId === claims.workspaceId && note.userId === claims.userId,
          )
          .sort((a, b) => a.createdAt - b.createdAt),
      );
    },

    async create(claims: AuthClaims, input: NoteCreate): Promise<NoteData> {
      const note = Note.parse({
        id: randomUUID(),
        workspaceId: claims.workspaceId,
        userId: claims.userId,
        text: input.text,
        color: input.color,
        done: false,
        createdAt: Date.now(),
      });
      notes.set(note.id, note);
      return structuredClone(note);
    },

    async update(claims: AuthClaims, id: string, input: NoteUpdate): Promise<NoteData> {
      const note = owned(claims, id);
      if (!note) {
        throw new NotFoundError(`unknown note ${id}`);
      }
      const updated = Note.parse({ ...note, ...input });
      notes.set(id, updated);
      return structuredClone(updated);
    },

    async remove(claims: AuthClaims, id: string): Promise<void> {
      if (!owned(claims, id)) {
        throw new NotFoundError(`unknown note ${id}`);
      }
      notes.delete(id);
    },
  };
}
