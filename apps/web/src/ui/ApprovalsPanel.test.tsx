// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { api } from "../api/index.js";
import { useRecords } from "../api/records.js";
import RightDrawer from "./RightDrawer.js";

afterEach(cleanup);

/**
 * The mock api is a singleton per test file and the fixture reuses stable change ids,
 * so this file runs one ordered flow: My day, process, approve three, reject one.
 */
beforeEach(async () => {
  useRecords.setState({ myDay: null, pending: [], project: null, account: null, meeting: null });
  await useRecords.getState().load();
});

async function processFixture() {
  await api.processMeeting({ zoneId: "acme_room", fixture: "acme-sync" });
  await useRecords.getState().refetch(["proposed_changes", "meetings", "tasks", "milestones", "commitments"]);
}

describe("RightDrawer", () => {
  it("1. shows My day when nothing is pending", () => {
    render(<RightDrawer />);
    expect(screen.getByRole("heading", { name: "My day" })).toBeTruthy();
    expect(screen.getByText("Fix webhook signature validation")).toBeTruthy();
  });

  it("2. replaces My day with the meeting summary and before/after cards", async () => {
    await processFixture();
    render(<RightDrawer />);
    expect(screen.getByRole("heading", { name: "Approvals (4)" })).toBeTruthy();
    expect(screen.getByLabelText("Meeting summary").textContent).toContain("go-live moves to 22 Nov");
    const drawer = screen.getByLabelText("Approvals");
    expect(within(drawer).getByText("Move milestone date")).toBeTruthy();
    expect(within(drawer).getAllByText("2026-11-15")).toHaveLength(2);
    expect(within(drawer).getAllByText("2026-11-22")).toHaveLength(2);
    // ...with a tab back to My day.
    fireEvent.click(screen.getByRole("tab", { name: "My day" }));
    expect(screen.getByRole("heading", { name: "My day" })).toBeTruthy();
  });

  it("3. approves three changes and rejects one; My day then shows the result", async () => {
    render(<RightDrawer />);
    const drawer = () => screen.getByLabelText("Approvals");
    for (let n = 4; n > 1; n--) {
      const approve = within(drawer()).getAllByRole("button", { name: "Approve" })[0];
      fireEvent.click(approve);
      expect((approve as HTMLButtonElement).disabled).toBe(true);
      await waitFor(() => expect(screen.queryByRole("heading", { name: `Approvals (${n - 1})` })).toBeTruthy());
    }
    fireEvent.click(within(drawer()).getByRole("button", { name: "Reject" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "My day" })).toBeTruthy());
    expect(screen.getByText(/Go-live by 22 Nov/)).toBeTruthy();
  });
});
