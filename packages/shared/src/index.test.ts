import { describe, expect, it } from "vitest";
import { SHARED_HELLO, sharedHello } from "./index.js";

describe("shared hello (M0 gate)", () => {
  it("exports the shared constant both apps print", () => {
    expect(SHARED_HELLO).toBe("office-shared-hello-m0");
    expect(sharedHello()).toBe(SHARED_HELLO);
  });
});
