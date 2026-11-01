// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => cleanup());
import DisplayOverlay from "./DisplayOverlay";
import type { ScreenData } from "./screens";

const DATA: ScreenData = {
  id: "project",
  title: "Acme Payments Integration",
  tone: "warn",
  sections: [
    { heading: "Milestones", lines: ["Go-live · 15 Nov (upcoming)"] },
    { heading: "Blocked", lines: ["Fix webhooks — vendor fix (Maya)", "Second line"] },
  ],
};

describe("DisplayOverlay", () => {
  it("shows the same content as the wall screen, every line", () => {
    render(<DisplayOverlay data={DATA} onClose={() => {}} />);
    expect(screen.getByRole("dialog", { name: "Acme Payments Integration status" })).toBeDefined();
    for (const section of DATA.sections) {
      expect(screen.getByText(section.heading)).toBeDefined();
      for (const line of section.lines) {
        expect(screen.getByText(line)).toBeDefined();
      }
    }
  });

  it("closes on the button, the backdrop and Escape", () => {
    const onClose = vi.fn();
    const { rerender, unmount } = render(<DisplayOverlay data={DATA} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(document.querySelector(".display-backdrop")!);
    expect(onClose).toHaveBeenCalledTimes(2);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(3);
    rerender(<DisplayOverlay data={DATA} onClose={() => {}} />);
    unmount();
  });
});
