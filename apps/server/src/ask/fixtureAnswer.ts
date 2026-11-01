import {
  Account,
  Commitment,
  Meeting,
  Milestone,
  Project,
  Task,
  type AskSourceType,
} from "@office/shared";
import type { AnswerFn } from "../llm/fixture.js";

/** The fixed abstention message, shared with `FixtureLlm` and the Meta adapter's prompt. */
export const ABSTAIN_MESSAGE = "I don't have a record of that.";

const SOURCE_TYPES: ReadonlySet<string> = new Set([
  "task",
  "milestone",
  "commitment",
  "meeting",
  "account",
  "project",
]);

/** Topics the records never cover: the fixture abstains instead of guessing. */
const EXCLUDED = [
  "ceo",
  "cto",
  "cfo",
  "cio",
  "coo",
  "founder",
  "founders",
  "headquarters",
  "revenue",
  "profit",
  "stock",
  "shares",
  "email",
  "phone",
  "address",
  "salary",
  "salaries",
  "lawsuit",
];

/** The fixture only answers questions about these topics; anything else abstains. */
const ANSWERABLE = [
  "status",
  "milestone",
  "go-live",
  "go live",
  "golive",
  "deadline",
  "due",
  "date",
  "when",
  "owner",
  "owns",
  "owned",
  "task",
  "tasks",
  "project",
  "account",
  "commitment",
  "commitments",
  "commit",
  "blocked",
  "blocker",
  "blockers",
  "progress",
  "update",
  "integration",
  "acme",
  "decision",
  "decisions",
  "decide",
  "decided",
  "summary",
  "my day",
  "meeting",
  "meetings",
  "done",
  "todo",
  "work",
  "plan",
];

const DECISION_HINT = [/\bdecisions?\b/, /\bdecide\b/, /\bdecided\b/, /\bagreed?\b/];

interface UsableRecord {
  type: AskSourceType;
  id: string;
  record: Record<string, unknown>;
}

function usable(value: unknown): UsableRecord | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const envelope = value as { type?: unknown; id?: unknown; record?: unknown };
  if (typeof envelope.type !== "string" || !SOURCE_TYPES.has(envelope.type)) {
    return null;
  }
  if (typeof envelope.id !== "string" || envelope.id.length === 0) {
    return null;
  }
  if (typeof envelope.record !== "object" || envelope.record === null) {
    return null;
  }
  const parsed = parseRecord(envelope.type, envelope.record);
  if (!parsed) {
    return null;
  }
  return { type: envelope.type as AskSourceType, id: envelope.id, record: parsed };
}

/** Keeps only envelopes whose record parses with its shared schema. */
function parseRecord(type: string, record: unknown): Record<string, unknown> | null {
  let parsed;
  switch (type) {
    case "task":
      parsed = Task.safeParse(record);
      break;
    case "milestone":
      parsed = Milestone.safeParse(record);
      break;
    case "commitment":
      parsed = Commitment.safeParse(record);
      break;
    case "meeting":
      parsed = Meeting.safeParse(record);
      break;
    case "account":
      parsed = Account.safeParse(record);
      break;
    case "project":
      parsed = Project.safeParse(record);
      break;
    default:
      return null;
  }
  if (!parsed.success) {
    return null;
  }
  return parsed.data as unknown as Record<string, unknown>;
}

function abstain(): { answer: string; sourceIds: string[] } {
  return { answer: ABSTAIN_MESSAGE, sourceIds: [] };
}

function str(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * The deterministic answer function (P3-B wires it into `FixtureLlm` via `createLlm`'s
 * `answer` slot). It composes the answer from the retrieved records only, so it says
 * whatever date the records carry; it abstains when nothing was retrieved or the
 * question asks about something the records never cover. The pipeline validates the
 * raw `{ answer, sourceIds }` shape before trusting it.
 */
export const fixtureAnswer: AnswerFn = (question: string, records: unknown[]) => {
  const text = question.toLowerCase();
  const words = new Set(text.split(/[^a-z0-9-]+/g));
  if (EXCLUDED.some((topic) => words.has(topic))) {
    return abstain();
  }
  if (!ANSWERABLE.some((topic) => text.includes(topic))) {
    return abstain();
  }
  const usableRecords: UsableRecord[] = [];
  for (const record of records) {
    const parsed = usable(record);
    if (parsed) {
      usableRecords.push(parsed);
    }
  }
  if (usableRecords.length === 0) {
    return abstain();
  }

  const sentences: string[] = [];
  const sourceIds: string[] = [];
  const cite = (id: string): void => {
    if (!sourceIds.includes(id)) {
      sourceIds.push(id);
    }
  };
  const byType = (type: AskSourceType): UsableRecord[] =>
    usableRecords.filter((entry) => entry.type === type);

  for (const entry of byType("account")) {
    sentences.push(`${str(entry.record, "name")} is in stage ${str(entry.record, "dealStage")}.`);
    cite(entry.id);
  }
  for (const entry of byType("project")) {
    sentences.push(`Project ${str(entry.record, "name")}.`);
    cite(entry.id);
  }
  for (const entry of byType("milestone")) {
    sentences.push(
      `${str(entry.record, "name")} is due ${str(entry.record, "targetDate")} (${str(entry.record, "status")}).`,
    );
    cite(entry.id);
  }
  for (const entry of byType("commitment")) {
    const due = str(entry.record, "dueDate");
    sentences.push(`Commitment: ${str(entry.record, "text")}${due ? ` (due ${due})` : ""}.`);
    cite(entry.id);
  }
  for (const entry of byType("task")) {
    const owner = str(entry.record, "ownerId");
    const due = str(entry.record, "dueDate");
    const blockedReason = str(entry.record, "blockedReason");
    sentences.push(
      `"${str(entry.record, "title")}" is ${str(entry.record, "status")}` +
        `${owner ? `, owned by ${owner}` : ""}${due ? `, due ${due}` : ""}` +
        `${blockedReason ? ` (blocked: ${blockedReason})` : ""}.`,
    );
    cite(entry.id);
  }
  const wantsDecisions = DECISION_HINT.some((pattern) => pattern.test(text));
  for (const entry of byType("meeting")) {
    const zoneId = str(entry.record, "zoneId");
    sentences.push(`Meeting in ${zoneId}: ${str(entry.record, "summary")}`);
    if (wantsDecisions) {
      const decisions = entry.record["decisions"];
      if (Array.isArray(decisions) && decisions.length > 0) {
        const texts = decisions
          .map((decision) =>
            typeof decision === "object" && decision !== null
              ? str(decision as Record<string, unknown>, "text")
              : null,
          )
          .filter((item): item is string => item !== null);
        if (texts.length > 0) {
          sentences.push(`Decisions: ${texts.join("; ")}.`);
        }
      }
    }
    cite(entry.id);
  }

  if (sentences.length === 0 || sourceIds.length === 0) {
    return abstain();
  }
  return { answer: sentences.join(" "), sourceIds };
};
