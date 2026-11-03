// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { DEMO_MILESTONE, DEMO_TASKS, type Receipt } from "@office/shared";
import { receiptsApi } from "../api/receipts.js";
import { useReceiptsStore } from "./store.js";
import AskPanel from "../ui/AskPanel.js";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  useReceiptsStore.setState({ byKey: {} });
});

function receiptFor(recordId: string, recordLabel: string): Receipt {
  return {
    changeId: "ac0e0031-0031-4031-8031-000000000031",
    kind: "milestone_date",
    recordType: "milestone",
    recordId,
    recordLabel,
    before: { targetDate: "2026-11-15" },
    after: { targetDate: "2026-11-22" },
    meetingId: "ac0e0099-0099-4099-8099-000000000099",
    meetingLabel: "Acme sync",
    decision: "approved",
    deciderId: "dev-maya",
    deciderName: "Maya",
    decidedAt: Date.now(),
  };
}

async function askStatus() {
  render(<AskPanel />);
  fireEvent.change(screen.getByLabelText("Your question"), {
    target: { value: "What's the status of the Acme integration?" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Ask" }));
  await screen.findByRole("status");
}

describe("ask receipt chips", () => {
  it("keeps the Ask button unique even when a source label contains 'task'", async () => {
    // `getByRole("button", { name: "Ask" })` in Playwright matches substrings, so a chip
    // named "task …" used to collide with the submit button and break demo.spec.
    vi.spyOn(receiptsApi, "list").mockResolvedValue([
      receiptFor(DEMO_MILESTONE.id, "Go-live"),
      receiptFor(DEMO_TASKS[0]!.id, "Fix webhook signature validation"),
    ]);
    await askStatus();
    expect(screen.getAllByRole("button", { name: /ask/i })).toHaveLength(1);
    const chips = screen.getAllByRole("button", { name: "Show receipt details" });
    expect(chips).toHaveLength(2);
    fireEvent.click(chips[0]!);
    expect(screen.getByText(/Go-live 15 Nov → 22 Nov/)).toBeTruthy();
  });
});
