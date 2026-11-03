import { describe, expect, it } from "vitest";
import type { PersonRef, Receipt } from "@office/shared";
import { formatDecisionLine, formatReceiptChange, formatReceiptLine } from "./format";

const PEOPLE: PersonRef[] = [
  { id: "maya", name: "Maya" },
  { id: "arjun", name: "Arjun" },
];

function receipt(overrides: Partial<Receipt> = {}): Receipt {
  return {
    changeId: "ac0e0031-0031-4031-8031-000000000031",
    kind: "milestone_date",
    recordType: "milestone",
    recordId: "ac0e0004-0004-4004-8004-000000000004",
    recordLabel: "Go-live",
    before: { targetDate: "2026-11-15" },
    after: { targetDate: "2026-11-22" },
    meetingId: "ac0e0099-0099-4099-8099-000000000099",
    meetingLabel: "Acme sync",
    decision: "approved",
    deciderId: "dev-maya",
    deciderName: "Maya",
    decidedAt: new Date(2026, 10, 4, 21, 4).getTime(),
    ...overrides,
  };
}

describe("formatReceiptLine", () => {
  it("renders the hero line: change, meeting and approver", () => {
    expect(formatReceiptLine(receipt(), PEOPLE)).toBe(
      "Go-live 15 Nov → 22 Nov · Acme sync · Maya",
    );
  });

  it("names owners instead of ids", () => {
    const line = formatReceiptLine(
      receipt({
        kind: "task_reassign",
        recordType: "task",
        recordLabel: "Fix webhook signature validation",
        before: { ownerId: "maya" },
        after: { ownerId: "arjun" },
      }),
      PEOPLE,
    );
    expect(line).toBe("Fix webhook signature validation Maya → Arjun · Acme sync · Maya");
  });

  it("renders creates as additions", () => {
    const line = formatReceiptLine(
      receipt({
        kind: "task_create",
        recordType: "task",
        recordLabel: "Notify Acme of new date",
        before: null,
        after: { title: "Notify Acme of new date", ownerId: "maya", status: "todo" },
      }),
      PEOPLE,
    );
    expect(line).toContain("+ Notify Acme of new date");
    expect(line).toContain("Maya");
    expect(line).toContain("Acme sync");
  });
});

describe("formatReceiptChange", () => {
  it("renders several changed fields with their labels", () => {
    expect(
      formatReceiptChange(
        receipt({
          kind: "commitment_update",
          recordType: "commitment",
          recordLabel: "Go-live by 22 Nov",
          before: { text: "Go-live by 15 Nov", dueDate: "2026-11-15" },
          after: { text: "Go-live by 22 Nov", dueDate: "2026-11-22" },
        }),
      ),
    ).toBe("Go-live by 22 Nov (Text: Go-live by 15 Nov → Go-live by 22 Nov; Due: 15 Nov → 22 Nov)");
  });
});

describe("formatDecisionLine", () => {
  it("stamps approvals with the time", () => {
    expect(formatDecisionLine(receipt())).toBe("approved by Maya · 21:04");
  });

  it("names rejections without a receipt", () => {
    expect(formatDecisionLine(receipt({ decision: "rejected" }))).toBe("rejected by Maya");
  });
});
