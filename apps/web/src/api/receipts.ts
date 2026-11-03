import {
  ReceiptList,
  ReceiptQuery,
  type Receipt as ReceiptData,
  type ReceiptQuery as ReceiptQueryData,
} from "@office/shared";
import { getAuthToken } from "../auth/session.js";
import { ApiError } from "./http.js";

/**
 * Receipts (ARCHITECTURE.md 12.10, P6-R): the mock, unless `VITE_API=http` asks for the
 * server, chosen like `api/index.ts`. The mock has no decided changes to compose from, so
 * it reads empty; the http client parses every response with the shared schemas and sends
 * the access token as the Bearer [REDACTED]
 */
export interface ReceiptsApi {
  list(query?: ReceiptQueryData): Promise<ReceiptData[]>;
}

export class MockReceiptsApi implements ReceiptsApi {
  async list(query?: ReceiptQueryData): Promise<ReceiptData[]> {
    ReceiptQuery.parse(query ?? {});
    return [];
  }
}

export interface ReceiptsHttpOptions {
  baseUrl?: string;
  getToken?: () => Promise<string | null>;
}

export function createHttpReceiptsApi(options: ReceiptsHttpOptions = {}): ReceiptsApi {
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
    list: async (query?: ReceiptQueryData) => {
      const parsed = ReceiptQuery.parse(query ?? {});
      const params = new URLSearchParams();
      if (parsed.accountId) params.set("accountId", parsed.accountId);
      if (parsed.projectId) params.set("projectId", parsed.projectId);
      if (parsed.limit !== undefined) params.set("limit", String(parsed.limit));
      const suffix = params.size > 0 ? `?${params.toString()}` : "";
      return ReceiptList.parse(await request(`/receipts${suffix}`, { method: "GET" })).receipts;
    },
  };
}

export function createMockReceiptsApi(): ReceiptsApi {
  return new MockReceiptsApi();
}

export const receiptsApi: ReceiptsApi =
  import.meta.env.VITE_API === "http" ? createHttpReceiptsApi() : createMockReceiptsApi();
