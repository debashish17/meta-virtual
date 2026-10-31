import { describe, expect, it } from "vitest";
import { SHARED_HELLO } from "@office/shared";
import { OfficeRoom } from "./office.room.js";

describe("server hello (M0 gate)", () => {
  it("imports the shared constant", () => {
    expect(SHARED_HELLO).toBe("office-shared-hello-m0");
  });

  it("exposes the office room", () => {
    expect(typeof OfficeRoom).toBe("function");
  });
});
