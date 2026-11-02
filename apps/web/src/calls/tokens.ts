import { CallTokenRequest, CallTokenResponse } from "@office/shared";
import { getAuthToken } from "../auth/session.js";
import { serverUrl } from "../net/connection.js";

/** `POST /calls/token` failed: the status (0 when unreachable), the server's code, its message. */
export class CallTokenError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "CallTokenError";
    this.status = status;
    this.code = code;
  }
}

/** 503 `calls_off`: the server has no LiveKit keys, so calls are off everywhere. */
export class CallsOffError extends CallTokenError {
  constructor(message: string) {
    super(503, "calls_off", message);
    this.name = "CallsOffError";
  }
}

export interface TokenFetchDeps {
  fetchFn?: typeof fetch;
  baseUrl?: string;
  getToken?: () => Promise<string | null>;
}

/** The server's `{ error, message }` envelope (P3-B); there is no shared schema for it. */
function envelopeOf(body: unknown): { error: string; message: string } | null {
  if (typeof body !== "object" || body === null) return null;
  const { error, message } = body as Record<string, unknown>;
  if (typeof error !== "string" || typeof message !== "string") return null;
  return { error, message };
}

/**
 * Fetches a scoped LiveKit token for the zone the avatar is in. The request and
 * the response are parsed with the shared Zod schemas; the token is returned,
 * never logged. Failures throw `CallTokenError` (`CallsOffError` for 503
 * `calls_off`); the caller maps every failure to "Calls unavailable".
 */
export async function fetchCallToken(
  zoneId: string,
  deps: TokenFetchDeps = {},
): Promise<CallTokenResponse> {
  const body = CallTokenRequest.parse({ zoneId });
  const baseUrl = deps.baseUrl ?? serverUrl();
  const getToken = deps.getToken ?? getAuthToken;
  const token = await getToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  let response: Response;
  try {
    response = await (deps.fetchFn ?? fetch)(`${baseUrl}/calls/token`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
  } catch {
    throw new CallTokenError(0, "network", "could not reach the server");
  }
  let parsed: unknown = null;
  try {
    parsed = await response.json();
  } catch {
    parsed = null;
  }
  if (!response.ok) {
    const envelope = envelopeOf(parsed);
    if (response.status === 503 && envelope?.error === "calls_off") {
      throw new CallsOffError(envelope.message);
    }
    throw new CallTokenError(
      response.status,
      envelope?.error ?? `http_${response.status}`,
      envelope?.message ?? `request failed (${response.status})`,
    );
  }
  return CallTokenResponse.parse(parsed);
}
