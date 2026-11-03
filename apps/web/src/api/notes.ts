import {
  Note,
  NoteCreate,
  NoteList,
  NoteUpdate,
  WORKSPACE_ID,
  type Note as NoteData,
  type NoteCreate as NoteCreateData,
  type NoteUpdate as NoteUpdateData,
} from "@office/shared";
import { getAuthToken } from "../auth/session.js";
import { useMe } from "../office/me.js";
import { ApiError } from "./http.js";

/**
 * Personal notes (ARCHITECTURE.md 12.10, P6-C): the mock, unless `VITE_API=http` asks for
 * the server, chosen like `api/index.ts`. The mock keeps the notes in memory so offline
 * mode can add, edit, tick off and delete; the http client parses every response with the
 * shared schemas and sends the access token as the Bearer [REDACTED]
 */
export interface NotesApi {
  list(): Promise<NoteData[]>;
  create(input: NoteCreateData): Promise<NoteData>;
  update(id: string, input: NoteUpdateData): Promise<NoteData>;
  remove(id: string): Promise<void>;
}

export class MockNotesApi implements NotesApi {
  private readonly notes: NoteData[] = [];

  async list(): Promise<NoteData[]> {
    return [...this.notes];
  }

  async create(input: NoteCreateData): Promise<NoteData> {
    const created = NoteCreate.parse(input);
    const note = Note.parse({
      id: crypto.randomUUID(),
      workspaceId: WORKSPACE_ID,
      userId: useMe.getState().name,
      text: created.text,
      color: created.color,
      done: false,
      createdAt: Date.now(),
    });
    this.notes.push(note);
    return note;
  }

  async update(id: string, input: NoteUpdateData): Promise<NoteData> {
    const note = this.notes.find((item) => item.id === id);
    if (!note) {
      throw new ApiError(404, "not_found", `unknown note ${id}`);
    }
    const updated = Note.parse({ ...note, ...NoteUpdate.parse(input) });
    this.notes.splice(this.notes.indexOf(note), 1, updated);
    return updated;
  }

  async remove(id: string): Promise<void> {
    const at = this.notes.findIndex((item) => item.id === id);
    if (at < 0) {
      throw new ApiError(404, "not_found", `unknown note ${id}`);
    }
    this.notes.splice(at, 1);
  }
}

export interface NotesHttpOptions {
  baseUrl?: string;
  getToken?: () => Promise<string | null>;
}

export function createHttpNotesApi(options: NotesHttpOptions = {}): NotesApi {
  const raw = options.baseUrl ?? import.meta.env.VITE_SERVER_URL?.trim();
  const baseUrl = raw ? raw : "http://localhost:2567";
  const getToken = options.getToken ?? getAuthToken;

  async function request(path: string, init: { method: string; body?: unknown }): Promise<unknown> {
    const token = await getToken();
    const headers: Record<string, string> = {};
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    let payload: string | undefined;
    if (init.body !== undefined) {
      headers["Content-Type"] = "application/json";
      payload = JSON.stringify(init.body);
    }
    let response: Response;
    try {
      response = await fetch(`${baseUrl}${path}`, {
        method: init.method,
        headers,
        body: payload,
      });
    } catch {
      throw new ApiError(0, "network", "could not reach the server");
    }
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    if (!response.ok) {
      const envelope = body as { error?: unknown; message?: unknown } | null;
      throw new ApiError(
        response.status,
        typeof envelope?.error === "string" ? envelope.error : `http_${response.status}`,
        typeof envelope?.message === "string" ? envelope.message : `request failed (${response.status})`,
      );
    }
    return body;
  }

  return {
    list: async () => NoteList.parse(await request("/notes", { method: "GET" })).notes,

    create: async (input: NoteCreateData) =>
      Note.parse(await request("/notes", { method: "POST", body: NoteCreate.parse(input) })),

    update: async (id: string, input: NoteUpdateData) =>
      Note.parse(
        await request(`/notes/${encodeURIComponent(id)}`, {
          method: "PATCH",
          body: NoteUpdate.parse(input),
        }),
      ),

    remove: async (id: string) => {
      await request(`/notes/${encodeURIComponent(id)}`, { method: "DELETE" });
    },
  };
}

export function createMockNotesApi(): NotesApi {
  return new MockNotesApi();
}

export const notesApi: NotesApi =
  import.meta.env.VITE_API === "http" ? createHttpNotesApi() : createMockNotesApi();
