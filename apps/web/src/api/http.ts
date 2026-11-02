import {
  AccountStatus,
  AskResult,
  Meeting,
  MeetingCreate,
  MeetingProcessResult,
  MyDay,
  OkResult,
  ProjectStatus,
  ProposedChangeList,
  type MeetingCreate as MeetingCreateData,
} from "@office/shared";
import { getAuthToken } from "../auth/session.js";
import type { OfficeApi } from "./types.js";

/** A failed HTTP call: the status (0 when the server was unreachable), the server's code, and its message verbatim. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export interface HttpApiOptions {
  baseUrl?: string;
  getToken?: () => Promise<string | null>;
}

function envServerUrl(): string | undefined {
  const raw = import.meta.env.VITE_SERVER_URL?.trim();
  return raw ? raw : undefined;
}

/** The server's `{ error, message }` envelope (P3-B); there is no shared schema for it. */
function envelopeOf(body: unknown): { error: string; message: string } | null {
  if (typeof body !== "object" || body === null) {
    return null;
  }
  const { error, message } = body as Record<string, unknown>;
  if (typeof error !== "string" || typeof message !== "string") {
    return null;
  }
  return { error, message };
}

/**
 * The `OfficeApi` over HTTP (ARCHITECTURE.md 5 and 12.6): the same contract suite as the
 * mock runs against this (`http.contract.test.ts`). Every response is parsed with the shared
 * Zod schemas; the access token goes on every call as the Bearer [REDACTED]
 */
export function createHttpApi(options: HttpApiOptions = {}): OfficeApi {
  const baseUrl = options.baseUrl ?? envServerUrl() ?? "http://localhost:2567";
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
      const envelope = envelopeOf(body);
      throw new ApiError(
        response.status,
        envelope?.error ?? `http_${response.status}`,
        envelope?.message ?? `request failed (${response.status})`,
      );
    }
    return body;
  }

  return {
    myDay: async () => MyDay.parse(await request("/me/day", { method: "GET" })),

    projectStatus: async (id) =>
      ProjectStatus.parse(
        await request(`/projects/${encodeURIComponent(id)}/status`, { method: "GET" }),
      ),

    accountStatus: async (id) =>
      AccountStatus.parse(
        await request(`/accounts/${encodeURIComponent(id)}/status`, { method: "GET" }),
      ),

    listPending: async (meetingId) => {
      const query =
        meetingId === undefined
          ? "?status=pending"
          : `?status=pending&meetingId=${encodeURIComponent(meetingId)}`;
      const list = ProposedChangeList.parse(
        await request(`/proposed-changes${query}`, { method: "GET" }),
      );
      return list.changes;
    },

    processMeeting: async (input: MeetingCreateData) => {
      const created = MeetingCreate.parse(input);
      return MeetingProcessResult.parse(
        await request("/meetings", { method: "POST", body: created }),
      );
    },

    approve: async (id) => {
      OkResult.parse(
        await request(`/proposed-changes/${encodeURIComponent(id)}/approve`, { method: "POST" }),
      );
    },

    reject: async (id) => {
      OkResult.parse(
        await request(`/proposed-changes/${encodeURIComponent(id)}/reject`, { method: "POST" }),
      );
    },

    ask: async (question) =>
      AskResult.parse(await request("/ask", { method: "POST", body: { question } })),

    meeting: async (id) =>
      Meeting.parse(await request(`/meetings/${encodeURIComponent(id)}`, { method: "GET" })),
  };
}
