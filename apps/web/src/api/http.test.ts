import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEMO_ACCOUNT,
  DEMO_COMMITMENT,
  DEMO_CONTACT,
  DEMO_MILESTONE,
  DEMO_PROJECT,
  DEMO_TASKS,
} from "@office/shared";
import { ApiError, createHttpApi } from "./http.js";

const BASE = "http://127.0.0.1:2599";
const TOKEN = "dev:Maya";
const MEETING_ID = "11111111-1111-4111-8111-111111111111";

interface SeenCall {
  url: string;
  init: RequestInit | undefined;
}

function stubFetch(handler: (url: string, init: RequestInit | undefined) => Response): {
  calls: SeenCall[];
} {
  const calls: SeenCall[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: unknown, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return handler(String(url), init);
    }),
  );
  return { calls };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function apiWithToken() {
  return createHttpApi({ baseUrl: BASE, getToken: async () => TOKEN });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createHttpApi", () => {
  it("GETs /me/day with the Bearer [REDACTED] parses MyDay", async () => {
    const { calls } = stubFetch(() => json({ items: [] }));
    const day = await apiWithToken().myDay();
    expect(day).toEqual({ items: [] });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(`${BASE}/me/day`);
    expect(calls[0].init?.method ?? "GET").toBe("GET");
    expect((calls[0].init?.headers as Record<string, string>)["Authorization"]).toBe(
      `Bearer ${TOKEN}`,
    );
  });

  it("GETs project and account statuses with encoded ids", async () => {
    const { calls } = stubFetch((url) => {
      if (url.includes("/projects/")) {
        return json({
          project: DEMO_PROJECT,
          milestones: [DEMO_MILESTONE],
          tasks: DEMO_TASKS,
          decisions: [],
          people: [],
        });
      }
      return json({
        account: DEMO_ACCOUNT,
        contacts: [DEMO_CONTACT],
        commitments: [DEMO_COMMITMENT],
        openTasks: [],
        recentMeetings: [],
        people: [],
      });
    });
    const api = apiWithToken();
    const project = await api.projectStatus(DEMO_PROJECT.id);
    expect(project.project.id).toBe(DEMO_PROJECT.id);
    await api.accountStatus("a/b c");
    expect(calls[0].url).toBe(`${BASE}/projects/${DEMO_PROJECT.id}/status`);
    expect(calls[1].url).toBe(`${BASE}/accounts/a%2Fb%20c/status`);
  });

  it("lists pending changes, optionally for one meeting", async () => {
    const { calls } = stubFetch(() => json({ changes: [] }));
    const api = apiWithToken();
    expect(await api.listPending()).toEqual([]);
    expect(await api.listPending(MEETING_ID)).toEqual([]);
    expect(calls[0].url).toBe(`${BASE}/proposed-changes?status=pending`);
    expect(calls[1].url).toBe(
      `${BASE}/proposed-changes?status=pending&meetingId=${MEETING_ID}`,
    );
  });

  it("POSTs meetings, accepts 201 and parses the result", async () => {
    const { calls } = stubFetch(() =>
      json({ meetingId: MEETING_ID, proposedChanges: [] }, 201),
    );
    const result = await apiWithToken().processMeeting({
      zoneId: "acme_room",
      fixture: "acme-sync",
    });
    expect(result).toEqual({ meetingId: MEETING_ID, proposedChanges: [] });
    expect(calls[0].url).toBe(`${BASE}/meetings`);
    expect(calls[0].init?.method).toBe("POST");
    expect(calls[0].init?.body).toBe(
      JSON.stringify({ zoneId: "acme_room", fixture: "acme-sync" }),
    );
  });

  it("validates processMeeting input before any fetch", async () => {
    const { calls } = stubFetch(() => json({}));
    await expect(apiWithToken().processMeeting({} as never)).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });

  it("approves and rejects with bodiless POSTs returning void", async () => {
    const { calls } = stubFetch(() => json({ ok: true }));
    const api = apiWithToken();
    await expect(api.approve(MEETING_ID)).resolves.toBeUndefined();
    await expect(api.reject(MEETING_ID)).resolves.toBeUndefined();
    expect(calls[0].url).toBe(`${BASE}/proposed-changes/${MEETING_ID}/approve`);
    expect(calls[0].init?.method).toBe("POST");
    expect(calls[0].init?.body).toBeUndefined();
    expect(calls[1].url).toBe(`${BASE}/proposed-changes/${MEETING_ID}/reject`);
  });

  it("POSTs ask with the question and parses the result", async () => {
    const { calls } = stubFetch(() =>
      json({
        answer: "hi",
        abstained: false,
        sources: [{ type: "task", id: MEETING_ID, label: "a task" }],
      }),
    );
    const result = await apiWithToken().ask("What is up?");
    expect(result.abstained).toBe(false);
    expect(calls[0].url).toBe(`${BASE}/ask`);
    expect(calls[0].init?.body).toBe(JSON.stringify({ question: "What is up?" }));
  });

  it("GETs one meeting", async () => {
    stubFetch(() =>
      json({
        id: MEETING_ID,
        zoneId: "acme_room",
        startedAt: 1,
        transcript: "t",
        summary: "s",
        decisions: [],
      }),
    );
    const meeting = await apiWithToken().meeting(MEETING_ID);
    expect(meeting.id).toBe(MEETING_ID);
  });

  it("turns error envelopes into ApiError with status, code and the server message", async () => {
    stubFetch(() =>
      json({ error: "conflict", message: `change ${MEETING_ID} is no longer pending` }, 409),
    );
    const failure = await apiWithToken().approve(MEETING_ID).catch((err: unknown) => err);
    expect(failure).toBeInstanceOf(ApiError);
    const apiError = failure as ApiError;
    expect(apiError.status).toBe(409);
    expect(apiError.code).toBe("conflict");
    expect(apiError.message).toBe(`change ${MEETING_ID} is no longer pending`);
  });

  it("maps 401 and 404 envelopes the same way", async () => {
    stubFetch((url) =>
      url.endsWith("/me/day")
        ? json({ error: "unauthorized", message: "unauthorized" }, 401)
        : json({ error: "not_found", message: "unknown meeting x" }, 404),
    );
    const api = apiWithToken();
    const unauthed = await api.myDay().catch((err: unknown) => err);
    expect((unauthed as ApiError).status).toBe(401);
    expect((unauthed as ApiError).code).toBe("unauthorized");
    const missing = await api.meeting(MEETING_ID).catch((err: unknown) => err);
    expect((missing as ApiError).status).toBe(404);
    expect((missing as ApiError).message).toBe("unknown meeting x");
  });

  it("falls back when the error body is not an envelope", async () => {
    stubFetch(() => new Response("<html>proxy down</html>", { status: 502 }));
    const failure = await apiWithToken().myDay().catch((err: unknown) => err);
    expect(failure).toBeInstanceOf(ApiError);
    expect((failure as ApiError).status).toBe(502);
    expect((failure as ApiError).code).toBe("http_502");
  });

  it("wraps a network failure as status 0", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    );
    const failure = await apiWithToken().myDay().catch((err: unknown) => err);
    expect(failure).toBeInstanceOf(ApiError);
    expect((failure as ApiError).status).toBe(0);
    expect((failure as ApiError).code).toBe("network");
  });

  it("rejects a success body that does not parse", async () => {
    stubFetch(() => json({ items: [{ id: 42 }] }));
    await expect(apiWithToken().myDay()).rejects.toThrow();
  });

  it("omits the Authorization header when there is no token", async () => {
    const { calls } = stubFetch(() => json({ items: [] }));
    const api = createHttpApi({ baseUrl: BASE, getToken: async () => null });
    await api.myDay();
    expect("Authorization" in ((calls[0].init?.headers as Record<string, string>) ?? {})).toBe(
      false,
    );
  });

  it("defaults to the dev server URL", async () => {
    vi.stubEnv("VITE_SERVER_URL", "");
    try {
      const { calls } = stubFetch(() => json({ items: [] }));
      await createHttpApi({ getToken: async () => TOKEN }).myDay();
      expect(calls[0].url).toBe("http://localhost:2567/me/day");
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
