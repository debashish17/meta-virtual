// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { api } from "../api/index.js";
import { useRecords } from "../api/records.js";
import RightDrawer from "./RightDrawer.js";

afterEach(cleanup);

describe("approval conflict", () => {
  it("refreshes the list when a change was decided elsewhere", async () => {
    await api.processMeeting({ zoneId: "acme_room", fixture: "acme-sync" });
    const [first] = await api.listPending();
    await useRecords.getState().load();
    render(<RightDrawer />);
    expect(screen.getByRole("heading", { name: "Approvals (4)" })).toBeTruthy();
    await api.approve(first.id); // decided elsewhere; the drawer still shows it
    fireEvent.click(screen.getAllByRole("button", { name: "Approve" })[0]);
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("Already decided"));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Approvals (3)" })).toBeTruthy());
  });
});
