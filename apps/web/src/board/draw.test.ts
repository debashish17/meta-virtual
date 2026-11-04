import { describe, expect, it } from "vitest";
import type { BoardPin } from "@office/shared";
import { BOARD_TEXTURE_MAX, boardHash, layoutBoardPins } from "./draw.js";

const pin = (id: string, createdAt: number, text = id): BoardPin => ({
  id,
  workspaceId: "northwind-demo",
  authorId: "dev-maya",
  authorName: "Maya",
  text,
  color: "#fbe7a1",
  createdAt,
});

describe("board texture layout", () => {
  it("shows the newest pins first, in reading order", () => {
    const pins = [pin("a", 3), pin("b", 1), pin("c", 2)];
    const placed = layoutBoardPins(pins);
    expect(placed.map((item) => item.pin.id)).toEqual(["a", "c", "b"]);
    expect(placed.map((item) => [item.col, item.row])).toEqual([
      [0, 0],
      [1, 0],
      [0, 1],
    ]);
  });

  it("caps the texture at the newest few; the overlay lists the rest", () => {
    const pins = Array.from({ length: BOARD_TEXTURE_MAX + 3 }, (_, i) =>
      pin(`p${i}`, i),
    );
    const placed = layoutBoardPins(pins);
    expect(placed).toHaveLength(BOARD_TEXTURE_MAX);
    expect(placed[0].pin.id).toBe(`p${BOARD_TEXTURE_MAX + 2}`);
  });

  it("hashes what the canvas shows: text, colour and author", () => {
    const pins = [pin("a", 1, "Ship it")];
    expect(boardHash(pins)).toBe(boardHash([...pins]));
    expect(boardHash([pin("a", 1, "Ship it now")])).not.toBe(boardHash(pins));
    expect(boardHash([{ ...pins[0], color: "#f4c2cd" }])).not.toBe(boardHash(pins));
    expect(boardHash([])).not.toBe(boardHash(pins));
  });
});
