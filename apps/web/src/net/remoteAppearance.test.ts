import { describe, expect, it } from "vitest";
import type { AvatarLook } from "@office/shared";
import { sameRemoteAppearance } from "./remoteAppearance.js";

const LOOK: AvatarLook = {
  body: "casual",
  top: "#34495e",
  accent: "#4f7393",
  bottom: "#3a3d42",
  shoes: "#24262a",
  height: 1.7,
};

describe("sameRemoteAppearance", () => {
  it("matches identical renders", () => {
    const a = { id: "p1", kind: "player" as const, name: "Maya", look: LOOK };
    expect(sameRemoteAppearance(a, { ...a, look: { ...LOOK } })).toBe(true);
  });

  it("detects identity, name and clothing changes", () => {
    const a = { id: "p1", kind: "player" as const, name: "Maya", look: LOOK };
    expect(sameRemoteAppearance(a, { ...a, id: "p2" })).toBe(false);
    expect(sameRemoteAppearance(a, { ...a, kind: "npc" as const })).toBe(false);
    expect(sameRemoteAppearance(a, { ...a, name: "Arjun" })).toBe(false);
    expect(sameRemoteAppearance(a, { ...a, look: { ...LOOK, top: "#f2f2ef" } })).toBe(false);
    expect(sameRemoteAppearance(a, { ...a, look: { ...LOOK, height: 1.8 } })).toBe(false);
  });
});
