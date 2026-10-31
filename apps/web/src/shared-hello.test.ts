import { describe, expect, it } from "vitest";
import { SHARED_HELLO } from "@office/shared";

describe("web shared constant (M0 gate)", () => {
  it("imports the shared constant rendered by App", () => {
    expect(SHARED_HELLO).toBe("office-shared-hello-m0");
  });
});
