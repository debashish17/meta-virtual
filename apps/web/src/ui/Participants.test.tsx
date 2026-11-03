// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { useNet } from "../net/store.js";
import { useMe } from "../office/me.js";
import Participants from "./Participants.js";

afterEach(cleanup);

beforeEach(() => {
  useMe.setState({ name: "Maya" });
  useNet.setState({
    status: "online",
    selfId: "s1",
    players: {
      s1: { id: "s1", userId: "dev-maya", name: "Maya", status: "working" },
      s2: { id: "s2", userId: "dev-arjun", name: "Arjun", status: "on_break" },
    } as never,
    npcs: {},
    chat: [],
    send: { chat: () => undefined, status: () => undefined },
  });
});

describe("Participants statuses", () => {
  it("shows Working and On a break", () => {
    const { container } = render(<Participants />);
    const subs = [...container.querySelectorAll(".pan-sub")].map((el) => el.textContent);
    expect(subs).toContain("Working");
    expect(subs).toContain("On a break");
  });

  it("offers the new statuses in the select", () => {
    render(<Participants />);
    const select = screen.getByLabelText("Your status") as HTMLSelectElement;
    expect([...select.options].map((o) => o.value)).toEqual([
      "available",
      "working",
      "on_break",
      "in_meeting",
      "away",
    ]);
    expect(select.value).toBe("working");
  });
});
