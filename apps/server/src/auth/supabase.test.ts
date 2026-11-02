import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { exportJWK, generateKeyPair, SignJWT, type JWK } from "jose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { UnauthorizedError } from "./verify.js";
import {
  resolveJwksUrl,
  SupabaseAuth,
  type WorkspaceMembership,
} from "./supabase.js";

const KID = "p3b-test-key";

let jwksServer: Server;
let jwksUrl = "";
let publicJwk: JWK;
let sign: (sub: string | undefined) => Promise<string>;

beforeAll(async () => {
  const { publicKey, privateKey } = await generateKeyPair("ES256");
  publicJwk = { ...(await exportJWK(publicKey)), kid: KID, use: "sig" };
  jwksServer = createServer((_req, res) => {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ keys: [publicJwk] }));
  });
  await new Promise<void>((resolve) => jwksServer.listen(0, "127.0.0.1", resolve));
  const { port } = jwksServer.address() as AddressInfo;
  jwksUrl = `http://127.0.0.1:${port}/.well-known/jwks.json`;
  sign = (sub: string | undefined) => {
    const jwt = new SignJWT({}).setProtectedHeader({ alg: "ES256", kid: KID });
    if (sub !== undefined) {
      jwt.setSubject(sub);
    }
    return jwt.sign(privateKey);
  };
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    jwksServer.close((error) => (error ? reject(error) : resolve())),
  );
});

function stubLookup(members: Record<string, WorkspaceMembership>) {
  const calls: string[] = [];
  const lookup = async (userId: string): Promise<WorkspaceMembership | null> => {
    calls.push(userId);
    return members[userId] ?? null;
  };
  return { calls, lookup };
}

describe("resolveJwksUrl", () => {
  it("prefers the explicit JWKS URL", () => {
    expect(
      resolveJwksUrl({
        SUPABASE_JWKS_URL: "http://127.0.0.1:54321/auth/v1/.well-known/jwks.json",
        SUPABASE_URL: "http://127.0.0.1:54321",
      }),
    ).toBe("http://127.0.0.1:54321/auth/v1/.well-known/jwks.json");
  });

  it("derives the hosted shape from SUPABASE_URL", () => {
    expect(resolveJwksUrl({ SUPABASE_JWKS_URL: "", SUPABASE_URL: "https://xyz.supabase.co/" })).toBe(
      "https://xyz.supabase.co/auth/v1/.well-known/jwks.json",
    );
  });

  it("fails closed naming the variable", () => {
    expect(() => resolveJwksUrl({ SUPABASE_JWKS_URL: "", SUPABASE_URL: "" })).toThrow(
      "SUPABASE_JWKS_URL",
    );
  });
});

describe("SupabaseAuth", () => {
  it("verifies an ES256 token and resolves workspace and name", async () => {
    const { lookup } = stubLookup({ "user-1": { workspaceId: "ws-1", name: "Maya" } });
    const auth = new SupabaseAuth({ jwksUrl, lookup });
    await expect(auth.verify(await sign("user-1"))).resolves.toEqual({
      userId: "user-1",
      name: "Maya",
      workspaceId: "ws-1",
    });
  });

  it("rejects a missing, foreign or subject-less token", async () => {
    const { lookup } = stubLookup({ "user-1": { workspaceId: "ws-1", name: "Maya" } });
    const auth = new SupabaseAuth({ jwksUrl, lookup });
    await expect(auth.verify(undefined)).rejects.toBeInstanceOf(UnauthorizedError);
    await expect(auth.verify("not-a-jwt")).rejects.toBeInstanceOf(UnauthorizedError);
    await expect(auth.verify(await sign(undefined))).rejects.toBeInstanceOf(UnauthorizedError);
    const foreign = await generateKeyPair("ES256");
    const forged = await new SignJWT({})
      .setProtectedHeader({ alg: "ES256", kid: "foreign" })
      .setSubject("user-1")
      .sign(foreign.privateKey);
    await expect(auth.verify(forged)).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("rejects a user with no workspace membership", async () => {
    const { lookup } = stubLookup({});
    const auth = new SupabaseAuth({ jwksUrl, lookup });
    await expect(auth.verify(await sign("stranger"))).rejects.toThrow("no workspace membership");
  });

  it("caches the membership for a few seconds, never a miss", async () => {
    let now = 1_000_000;
    const members: Record<string, WorkspaceMembership> = {
      "user-1": { workspaceId: "ws-1", name: "Maya" },
    };
    const { calls, lookup } = stubLookup(members);
    const auth = new SupabaseAuth({ jwksUrl, lookup, cacheTtlMs: 5_000, now: () => now });
    const token = await sign("user-1");
    await auth.verify(token);
    await auth.verify(token);
    expect(calls).toEqual(["user-1"]);
    now += 5_001;
    await auth.verify(token);
    expect(calls).toEqual(["user-1", "user-1"]);

    const stranger = await sign("stranger");
    await expect(auth.verify(stranger)).rejects.toBeInstanceOf(UnauthorizedError);
    members["stranger"] = { workspaceId: "ws-1", name: "Sam" };
    await expect(auth.verify(stranger)).resolves.toMatchObject({ name: "Sam" });
  });

  it("plugs into the room join seam", async () => {
    const { OfficeRoom } = await import("../room/office.room.js");
    const { lookup } = stubLookup({ "user-9": { workspaceId: "ws-9", name: "Arjun" } });
    OfficeRoom.verifier = new SupabaseAuth({ jwksUrl, lookup });
    try {
      await expect(OfficeRoom.onAuth(await sign("user-9"), {})).resolves.toEqual({
        userId: "user-9",
        name: "Arjun",
        workspaceId: "ws-9",
      });
      await expect(OfficeRoom.onAuth("bogus", {})).rejects.toBeInstanceOf(UnauthorizedError);
    } finally {
      OfficeRoom.verifier = null;
    }
  });
});
