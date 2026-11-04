import { DEMO_ACCOUNT, DEMO_PROJECT, type PersonRef, type Receipt } from "@office/shared";
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

/** Fields that point at another record. A receipt names them, never prints their ids. */
const REFERENCE_FIELDS = new Set(["projectId", "accountId", "linkedTaskId", "linkedMilestoneId"]);

/** The records the office can name, as the approval cards do (`ui/format.ts`). */
const RECORD_NAMES: Record<string, string> = {
  [DEMO_PROJECT.id]: DEMO_PROJECT.name,
  [DEMO_ACCOUNT.id]: DEMO_ACCOUNT.name,
};

function recordName(value: unknown): string | undefined {
  return typeof value === "string" ? RECORD_NAMES[value] : undefined;
}

function personName(people: PersonRef[], id: string): string {
  return people.find((person) => person.id === id)?.name ?? id;
}

/** One changed value, readable: dates shorten, owners and records resolve, the rest stringifies. */
export function formatReceiptValue(field: string, value: unknown, people: PersonRef[]): string {
  if (value === null || value === undefined) {
    return "—";
  }
  if (REFERENCE_FIELDS.has(field)) {
    return recordName(value) ?? String(value);
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
      // A link the office cannot name is left out: the line reads as a sentence, not ids.
      .filter((field) => !REFERENCE_FIELDS.has(field) || recordName(receipt.after[field]) !== undefined)
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
