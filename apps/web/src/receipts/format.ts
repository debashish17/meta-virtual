import type { PersonRef, Receipt } from "@office/shared";
import { shortDate } from "../office/displays/screens.js";

/**
 * Receipt lines (P6-R, USP A Phase 0): every approved change reads as before → after with
 * its source meeting and approver, on the floor and not only in a drawer. The hero line:
 * "Go-live 15 Nov → 22 Nov · Acme sync · Maya".
 */

const FIELD_LABELS: Record<string, string> = {
  targetDate: "Date",
  text: "Text",
  dueDate: "Due",
  ownerId: "Owner",
  title: "Title",
  projectId: "Project",
  accountId: "Account",
  status: "Status",
  linkedTaskId: "Linked task",
  linkedMilestoneId: "Linked milestone",
};

function personName(people: PersonRef[], id: string): string {
  return people.find((person) => person.id === id)?.name ?? id;
}

/** One changed value, readable: dates shorten, owners resolve, the rest stringifies. */
export function formatReceiptValue(field: string, value: unknown, people: PersonRef[]): string {
  if (value === null || value === undefined) {
    return "—";
  }
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return shortDate(value);
  }
  if (field === "ownerId" && typeof value === "string") {
    return personName(people, value);
  }
  return String(value);
}

/** The change itself: "Go-live 15 Nov → 22 Nov", or "+ Notify Acme of new date" for creates. */
export function formatReceiptChange(receipt: Receipt, people: PersonRef[] = []): string {
  const before = receipt.before ?? {};
  const fields = [
    ...Object.keys(before),
    ...Object.keys(receipt.after).filter((field) => !(field in before)),
  ];
  if (receipt.before === null) {
    const labelFields = new Set(["title", "text"]);
    const rest = fields
      .filter((field) => !labelFields.has(field))
      .map(
        (field) =>
          `${FIELD_LABELS[field] ?? field}: ${formatReceiptValue(field, receipt.after[field], people)}`,
      );
    return `+ ${receipt.recordLabel}${rest.length > 0 ? ` (${rest.join("; ")})` : ""}`;
  }
  if (fields.length === 1) {
    const field = fields[0]!;
    return `${receipt.recordLabel} ${formatReceiptValue(field, before[field], people)} → ${formatReceiptValue(field, receipt.after[field], people)}`;
  }
  const parts = fields.map(
    (field) =>
      `${FIELD_LABELS[field] ?? field}: ${formatReceiptValue(field, before[field], people)} → ${formatReceiptValue(field, receipt.after[field], people)}`,
  );
  return `${receipt.recordLabel} (${parts.join("; ")})`;
}

/** The full line: change, source meeting and approver. */
export function formatReceiptLine(receipt: Receipt, people: PersonRef[] = []): string {
  return `${formatReceiptChange(receipt, people)} · ${receipt.meetingLabel} · ${receipt.deciderName}`;
}

/** The drawer history line under a decided change. */
export function formatDecisionLine(receipt: Receipt): string {
  if (receipt.decision === "rejected") {
    return `rejected by ${receipt.deciderName}`;
  }
  const at = new Date(receipt.decidedAt);
  const pad = (n: number): string => String(n).padStart(2, "0");
  return `approved by ${receipt.deciderName} · ${pad(at.getHours())}:${pad(at.getMinutes())}`;
}
