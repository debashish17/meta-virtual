import { randomBytes } from "node:crypto";
import { TokenVerifier } from "livekit-server-sdk";
import { describe, expect, it } from "vitest";
import type { Env } from "../env.js";
import { loadEnv } from "../env.js";
import {
  CallForbiddenError,
  CallsOffError,
  callsEnabled,
  issueCallToken,
  liveKitRoomName,
  type PlayerZoneLookup,
} from "./tokens.js";

const CLAIMS = { userId: "dev-maya", name: "Maya", workspaceId: "northwind-demo" };

/** Test-only LiveKit credentials, generated in-code: never real keys, never committed. */
function liveEnv(): { env: Env; apiKey: string; apiSecret: string } {
  const apiKey = `test-key-${randomBytes(4).toString("hex")}`;
  const apiSecret = randomBytes(32).toString("base64");
  const env = loadEnv({
    LIVEKIT_URL: "https://calls.example.test",
    LIVEKIT_API_KEY: apiKey,
    LIVEKIT_API_SECRET: apiSecret,
  });
  return { env, apiKey, apiSecret };
}

function atZone(zoneId: string | null): PlayerZoneLookup {
  return () => zoneId;
}

describe("liveKitRoomName", () => {
  it("names one LiveKit room per workspace zone", () => {
    expect(liveKitRoomName("northwind-demo", "acme_room")).toBe("northwind-demo--acme_room");
  });
});

describe("callsEnabled", () => {
  it("is off without keys and on with all three LIVEKIT_* set", () => {
    expect(callsEnabled(loadEnv({}))).toBe(false);
    expect(callsEnabled(liveEnv().env)).toBe(true);
  });

  it("is off when any one of the three is missing", () => {
    const { apiKey, apiSecret } = liveEnv();
    expect(
      callsEnabled(loadEnv({ LIVEKIT_URL: "https://calls.example.test", LIVEKIT_API_KEY: apiKey })),
    ).toBe(false);
    expect(
      callsEnabled(
        loadEnv({ LIVEKIT_API_KEY: apiKey, LIVEKIT_API_SECRET: apiSecret }),
      ),
    ).toBe(false);
    expect(
      callsEnabled(
        loadEnv({ LIVEKIT_URL: "https://calls.example.test", LIVEKIT_API_SECRET: apiSecret }),
      ),
    ).toBe(false);
  });
});

describe("issueCallToken", () => {
  it.each(["acme_room", "project_room", "meeting_a"])(
    "issues a token for the caller's %s, scoped to that room only",
    async (zoneId) => {
      const { env, apiKey, apiSecret } = liveEnv();
      const seen: { workspaceId: string; userId: string }[] = [];
      const lookup: PlayerZoneLookup = (workspaceId, userId) => {
        seen.push({ workspaceId, userId });
        return zoneId;
      };
      const result = await issueCallToken({ env, claims: CLAIMS, zoneId, playerZone: lookup });
      expect(result.url).toBe("https://calls.example.test");
      // The workspace comes from the verified token, never the client.
      expect(seen).toEqual([{ workspaceId: CLAIMS.workspaceId, userId: CLAIMS.userId }]);

      const grants = await new TokenVerifier(apiKey, apiSecret).verify(result.token);
      expect(grants.sub).toBe(CLAIMS.userId);
      expect(grants.name).toBe(CLAIMS.name);
      expect(grants.video).toMatchObject({
        roomJoin: true,
        room: `${CLAIMS.workspaceId}--${zoneId}`,
        canPublish: true,
        canSubscribe: true,
      });
      // Join, publish and subscribe for that one room: nothing else.
      expect(grants.video?.roomCreate).toBeFalsy();
      expect(grants.video?.roomAdmin).toBeFalsy();
      expect(grants.video?.roomList).toBeFalsy();
      expect(grants.video?.roomRecord).toBeFalsy();
      // A one-hour TTL: exp is an hour after now, give or take a second.
      expect(typeof grants.exp).toBe("number");
      const inSeconds = grants.exp! - Math.floor(Date.now() / 1000);
      expect(inSeconds).toBeGreaterThanOrEqual(3599);
      expect(inSeconds).toBeLessThanOrEqual(3600);
    },
  );

  it("refuses a zone the caller is not in right now", async () => {
    const { env } = liveEnv();
    await expect(
      issueCallToken({ env, claims: CLAIMS, zoneId: "acme_room", playerZone: atZone("meeting_a") }),
    ).rejects.toBeInstanceOf(CallForbiddenError);
  });

  it("refuses the open plan even when the caller is there", async () => {
    const { env } = liveEnv();
    await expect(
      issueCallToken({ env, claims: CLAIMS, zoneId: "library", playerZone: atZone("library") }),
    ).rejects.toBeInstanceOf(CallForbiddenError);
  });

  it("refuses the kitchen even when the caller is there", async () => {
    const { env } = liveEnv();
    await expect(
      issueCallToken({ env, claims: CLAIMS, zoneId: "cafe", playerZone: atZone("cafe") }),
    ).rejects.toBeInstanceOf(CallForbiddenError);
  });

  it("refuses an unknown zone", async () => {
    const { env } = liveEnv();
    await expect(
      issueCallToken({ env, claims: CLAIMS, zoneId: "nope", playerZone: atZone("nope") }),
    ).rejects.toBeInstanceOf(CallForbiddenError);
  });

  it("refuses a caller who is not connected to the office", async () => {
    const { env } = liveEnv();
    await expect(
      issueCallToken({ env, claims: CLAIMS, zoneId: "acme_room", playerZone: atZone(null) }),
    ).rejects.toBeInstanceOf(CallForbiddenError);
  });

  it("is off without LiveKit keys", async () => {
    await expect(
      issueCallToken({
        env: loadEnv({}),
        claims: CLAIMS,
        zoneId: "acme_room",
        playerZone: atZone("acme_room"),
      }),
    ).rejects.toBeInstanceOf(CallsOffError);
  });
});
