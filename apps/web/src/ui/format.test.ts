import { describe, expect, it } from "vitest";
import { DEMO_ACCOUNT, DEMO_PROJECT, type ProposedChange } from "@office/shared";
import { changeRows, changeTitle, formatFieldValue, isMovementKey } from "./format.js";

const MILLISECOND = "2026-11-15";

function change(over: Partial<ProposedChange>): ProposedChange {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    type: "milestone_date",
    status: "pending",
    targetId: "00000000-0000-4000-8000-000000000002",
    before: { targetDate: MILLISECOND },
    after: { targetDate: "2026-11-22" },
    needsReview: false,
    sourceMeetingId: "00000000-0000-4000-8000-000000000003",
    ...over,
  };
}

describe("changeTitle", () => {
  it("names every change type", () => {
    expect(changeTitle("milestone_date")).toBe("Move milestone date");
    expect(changeTitle("commitment_update")).toBe("Update commitment");
    expect(changeTitle("commitment_create")).toBe("New commitment");
    expect(changeTitle("task_create")).toBe("New task");
    expect(changeTitle("task_update")).toBe("Update task");
    expect(changeTitle("task_reassign")).toBe("Reassign task");
  });
});

describe("changeRows", () => {
  it("pairs before and after values per field", () => {
    const rows = changeRows(change({}));
    expect(rows).toEqual([{ field: "targetDate", label: "Date", before: MILLISECOND, after: "2026-11-22" }]);
  });

  it("marks added fields on creates (no before)", () => {
    const rows = changeRows(
      change({
        type: "task_create",
        targetId: null,
        before: null,
        after: { title: "Notify Acme of new date", ownerId: "maya", status: "todo" },
      }),
    );
    expect(rows).toEqual([
      { field: "title", label: "Title", before: undefined, after: "Notify Acme of new date" },
      { field: "ownerId", label: "Owner", before: undefined, after: "Maya" },
      { field: "status", label: "Status", before: undefined, after: "todo" },
    ]);
  });

  it("resolves owner keys to names", () => {
    expect(formatFieldValue("ownerId", "arjun")).toBe("Arjun");
  });

  it("resolves demo project and account ids to names", () => {
    expect(formatFieldValue("projectId", DEMO_PROJECT.id)).toBe(DEMO_PROJECT.name);
    expect(formatFieldValue("accountId", DEMO_ACCOUNT.id)).toBe(DEMO_ACCOUNT.name);
    expect(formatFieldValue("projectId", "something-else")).toBe("something-else");
  });

  it("renders null as an em dash and unknown fields raw", () => {
    expect(formatFieldValue("dueDate", null)).toBe("—");
    expect(formatFieldValue("mystery", 42)).toBe("42");
  });
});

describe("isMovementKey", () => {
  it("matches the avatar's walk keys, E and shift", () => {
    for (const code of ["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "KeyE", "ShiftLeft", "ShiftRight"]) {
      expect(isMovementKey(code)).toBe(true);
    }
  });

  it("lets other keys through", () => {
    for (const code of ["Enter", "Escape", "Space", "Tab", "KeyQ"]) {
      expect(isMovementKey(code)).toBe(false);
    }
  });
});
