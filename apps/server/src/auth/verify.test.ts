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
});
