import type { AuthClaims, Note, NoteCreate, NoteUpdate } from "@office/shared";

/**
 * Personal notes (ARCHITECTURE.md 12.10, P6-C): private to their author, never broadcast.
 * P6-0 slot: the interface and an empty in-memory store; P6-C adds the Postgres
 * implementation and the migration (author-only RLS).
 */
export interface NoteStore {
  list(claims: AuthClaims): Promise<Note[]>;
  create(claims: AuthClaims, input: NoteCreate): Promise<Note>;
  update(claims: AuthClaims, id: string, input: NoteUpdate): Promise<Note>;
  remove(claims: AuthClaims, id: string): Promise<void>;
}

const TODO = "notes are not implemented yet (P6-C)";

export function createInMemoryNoteStore(): NoteStore {
  return {
    list: () => Promise.resolve([]),
    create: () => Promise.reject(new Error(TODO)),
    update: () => Promise.reject(new Error(TODO)),
    remove: () => Promise.reject(new Error(TODO)),
  };
}
