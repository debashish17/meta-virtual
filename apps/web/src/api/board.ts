import {
  BoardPin,
  BoardPinCreate,
  BoardPinList,
  WORKSPACE_ID,
  type BoardPin as BoardPinData,
  type BoardPinCreate as BoardPinCreateData,
} from "@office/shared";
import { getAuthToken } from "../auth/session.js";
import { useMe } from "../office/me.js";
import { ApiError } from "./http.js";

/**
 * Company-board pins (ARCHITECTURE.md 12.10, P6-D): the mock, unless `VITE_API=http` asks
 * for the server, chosen like `api/index.ts`. The mock keeps the pins in memory so offline
 * mode can pin and remove; the http client parses every response with the shared schemas
 * and sends the access token as the Bearer [REDACTED]
 */
export interface BoardApi {
  list(): Promise<BoardPinData[]>;
  create(input: BoardPinCreateData): Promise<BoardPinData>;
  remove(id: string): Promise<void>;
}

export class MockBoardApi implements BoardApi {
  private readonly pins: BoardPinData[] = [];

  async list(): Promise<BoardPinData[]> {
    return [...this.pins];
  }

  async create(input: BoardPinCreateData): Promise<BoardPinData> {
    const created = BoardPinCreate.parse(input);
    const pin = BoardPin.parse({
      id: crypto.randomUUID(),
      workspaceId: WORKSPACE_ID,
      authorId: useMe.getState().name,
      authorName: useMe.getState().name,
      text: created.text,
      color: created.color,
      createdAt: Date.now(),
    });
    this.pins.push(pin);
    return pin;
  }

  async remove(id: string): Promise<void> {
    const at = this.pins.findIndex((item) => item.id === id);
    if (at < 0) {
      throw new ApiError(404, "not_found", `unknown pin ${id}`);
    }
    this.pins.splice(at, 1);
  }
}

export interface BoardHttpOptions {
  baseUrl?: string;
  getToken?: () => Promise<string | null>;
}

export function createHttpBoardApi(options: BoardHttpOptions = {}): BoardApi {
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
    list: async () => BoardPinList.parse(await request("/board", { method: "GET" })).pins,

    create: async (input: BoardPinCreateData) =>
      BoardPin.parse(
        await request("/board", { method: "POST", body: BoardPinCreate.parse(input) }),
      ),

    remove: async (id: string) => {
      await request(`/board/${encodeURIComponent(id)}`, { method: "DELETE" });
    },
  };
}

export function createMockBoardApi(): BoardApi {
  return new MockBoardApi();
}

export const boardApi: BoardApi =
  import.meta.env.VITE_API === "http" ? createHttpBoardApi() : createMockBoardApi();
