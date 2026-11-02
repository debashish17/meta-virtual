import { describe, expect, it, vi } from "vitest";
import { CallsOffError, CallTokenError, fetchCallToken } from "./tokens.js";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("fetchCallToken", () => {
  it("posts the zone with the bearer token and parses the response", async () => {
    const fetchFn = vi.fn(async () =>
      jsonResponse(200, { url: "wss://livekit.example", token: "scoped-token" }),
    );
    const out = await fetchCallToken("acme_room", {
      fetchFn: fetchFn as typeof fetch,
      baseUrl: "http://server:2567",
      getToken: async () => "dev:Maya",
    });
    expect(out).toEqual({ url: "wss://livekit.example", token: "scoped-token" });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://server:2567/calls/token");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["Authorization"]).toBe("Bearer dev:Maya");
    expect(JSON.parse(init.body as string)).toEqual({ zoneId: "acme_room" });
  });

  it("rejects an empty zone before any fetch", async () => {
    const fetchFn = vi.fn();
    await expect(
      fetchCallToken("", { fetchFn: fetchFn as typeof fetch }),
    ).rejects.toThrow();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("maps 503 calls_off to CallsOffError", async () => {
    const fetchFn = vi.fn(async () =>
      jsonResponse(503, { error: "calls_off", message: "calls are off" }),
    );
    const err = await fetchCallToken("acme_room", {
      fetchFn: fetchFn as typeof fetch,
      baseUrl: "http://server:2567",
      getToken: async () => null,
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CallsOffError);
    expect((err as CallsOffError).status).toBe(503);
    expect((err as CallsOffError).code).toBe("calls_off");
  });

  it("maps other failures to CallTokenError without throwing anything else", async () => {
    const cases: Array<{ name: string; run: () => Promise<unknown> }> = [
      {
        name: "403 from another zone",
        run: () =>
          fetchCallToken("acme_room", {
            fetchFn: (async () =>
              jsonResponse(403, { error: "forbidden", message: "not in that zone" })) as typeof fetch,
            baseUrl: "http://server:2567",
          }),
      },
      {
        name: "404 before P5-A is merged",
        run: () =>
          fetchCallToken("acme_room", {
            fetchFn: (async () => new Response("Cannot POST /calls/token", { status: 404 })) as typeof fetch,
            baseUrl: "http://server:2567",
          }),
      },
      {
        name: "unreachable server",
        run: () =>
          fetchCallToken("acme_room", {
            fetchFn: (async () => {
              throw new TypeError("fetch failed");
            }) as typeof fetch,
            baseUrl: "http://server:2567",
          }),
      },
      {
        name: "garbage 200 body",
        run: () =>
          fetchCallToken("acme_room", {
            fetchFn: (async () => jsonResponse(200, { nope: true })) as typeof fetch,
            baseUrl: "http://server:2567",
          }),
      },
    ];
    for (const c of cases) {
      const err = await c.run().catch((e: unknown) => e);
      expect(err, c.name).toBeInstanceOf(Error);
    }
    const forbidden = (await cases[0].run().catch((e: unknown) => e)) as CallTokenError;
    expect(forbidden).toBeInstanceOf(CallTokenError);
    expect(forbidden.status).toBe(403);
    expect(forbidden.code).toBe("forbidden");
    const missing = (await cases[1].run().catch((e: unknown) => e)) as CallTokenError;
    expect(missing.status).toBe(404);
    const unreachable = (await cases[2].run().catch((e: unknown) => e)) as CallTokenError;
    expect(unreachable.status).toBe(0);
    expect(unreachable.code).toBe("network");
  });
});
