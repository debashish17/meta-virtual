import { describe, expect, it } from "vitest";
import { WORKSPACE_ID } from "@office/shared";
import { DevAuth, UnauthorizedError } from "./verify.js";

describe("DevAuth", () => {
  it("maps dev:<name> to a user of the demo workspace", async () => {
    const auth = new DevAuth("development");
    const maya = await auth.verify("dev:Maya");
    expect(maya).toEqual({ userId: "dev-maya", name: "Maya", workspaceId: WORKSPACE_ID });
    const guest = await auth.verify("dev:Sam");
    expect(guest.workspaceId).toBe(WORKSPACE_ID);
    expect(guest.name).toBe("Sam");
  });

  it("rejects a missing or malformed token", async () => {
    const auth = new DevAuth("development");
    await expect(auth.verify(undefined)).rejects.toBeInstanceOf(UnauthorizedError);
    await expect(auth.verify("Maya")).rejects.toBeInstanceOf(UnauthorizedError);
    await expect(auth.verify("dev:  ")).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("refuses to start in production", () => {
    expect(() => new DevAuth("production")).toThrow("production");
  });

  it("resolves a known name through the wired resolver", async () => {
    const auth = new DevAuth("development", async (name) =>
      name === "Maya" ? "uuid-maya" : null,
    );
    const maya = await auth.verify("dev:Maya");
    expect(maya.userId).toBe("uuid-maya");
    expect(maya.name).toBe("Maya");
  });

  it("keeps the legacy id when the resolver misses or throws", async () => {
    const missing = new DevAuth("development", async () => null);
    expect((await missing.verify("dev:Maya")).userId).toBe("dev-maya");
    const broken = new DevAuth("development", async () => {
      throw new Error("db down");
    });
    expect((await broken.verify("dev:Maya")).userId).toBe("dev-maya");
    const unknown = new DevAuth("development", async () => "uuid-x");
    expect((await unknown.verify("dev:Sam")).userId).toBe("dev-sam");
  });
});
