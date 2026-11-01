import { DEMO_ACCOUNT, DEMO_PEOPLE, DEMO_PROJECT, type ChangeType, type ProposedChange } from "@office/shared";

const TITLES: Record<ChangeType, string> = {
  milestone_date: "Move milestone date",
  commitment_update: "Update commitment",
  commitment_create: "New commitment",
  task_create: "New task",
  task_update: "Update task",
  task_reassign: "Reassign task",
};

/** The approval card's heading for a change type. */
export function changeTitle(type: ChangeType): string {
  return TITLES[type];
}

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

function personName(id: string): string {
  return DEMO_PEOPLE.find((p) => p.key === id)?.name ?? id;
}

/** One changed field, formatted for the before/after rows. */
export function formatFieldValue(field: string, value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (field === "ownerId" && typeof value === "string") return personName(value);
  if (field === "projectId" && value === DEMO_PROJECT.id) return DEMO_PROJECT.name;
  if (field === "accountId" && value === DEMO_ACCOUNT.id) return DEMO_ACCOUNT.name;
  return String(value);
}

export interface ChangeRow {
  field: string;
  label: string;
  before: string | undefined;
  after: string;
}

/** Before/after rows for an approval card; creates (no `before`) show additions only. */
export function changeRows(change: ProposedChange): ChangeRow[] {
  const before = change.before ?? {};
  const fields = [...Object.keys(before), ...Object.keys(change.after).filter((f) => !(f in before))];
  return fields.map((field) => ({
    field,
    label: FIELD_LABELS[field] ?? field,
    before: field in before ? formatFieldValue(field, before[field]) : undefined,
    after: formatFieldValue(field, change.after[field]),
  }));
}

/** The avatar's key codes (Avatar.tsx): panels swallow these on keydown so a focused
 * control never walks the avatar. Keyup is never swallowed: the avatar clears its held
 * keys on every keyup, and blocking that would stick movement on. */
const MOVEMENT_CODES = new Set([
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "KeyE",
]);

export function isMovementKey(code: string): boolean {
  return MOVEMENT_CODES.has(code) || code.startsWith("Shift");
}
