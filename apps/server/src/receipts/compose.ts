import {
  Receipt,
  type AskSourceType,
  type AuthClaims,
  type PersonRef,
  type ProposedChange,
  type Receipt as ReceiptData,
  type ReceiptQuery,
} from "@office/shared";
import type { AuditRow, Repo } from "../db/repo.js";

/**
 * Receipt composition (ARCHITECTURE.md 12.10, P6-R): one receipt per decided change, built
 * from the existing `Repo` reads (changes, audit rows, meetings, people, the records), so
 * receipts add no table and no write path. Workspace scoping comes free: every read below
 * is scoped to the caller's claims.
 */

type ChangeTable = "milestones" | "commitments" | "tasks";

function tableFor(type: ProposedChange["type"]): ChangeTable {
  if (type === "milestone_date") {
    return "milestones";
  }
  if (type === "commitment_update" || type === "commitment_create") {
    return "commitments";
  }
  return "tasks";
}

/** Canonical JSON: object keys sorted recursively, so jsonb round-trips compare equal. */
function stable(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stable(item)).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`)
    .sort();
  return `{${entries.join(",")}}`;
}

function auditKey(action: string, table: string, before: unknown, after: unknown): string {
  return `${action}|${table}|${stable(before)}|${stable(after)}`;
}

/**
 * The audit row each decision wrote. Audit rows carry no change id, so a decided change
 * matches on its decision (approve/reject), its table and its before/after; when several
 * identical changes hit one record, `rowId` disambiguates and the oldest row wins.
 */
function matchAudits(
  decided: ProposedChange[],
  audits: AuditRow[],
): Map<string, AuditRow> {
  const queues = new Map<string, AuditRow[]>();
  for (const audit of [...audits].sort((a, b) => a.ts - b.ts)) {
    const key = auditKey(audit.action, audit.table, audit.before, audit.after);
    const queue = queues.get(key);
    if (queue) {
      queue.push(audit);
    } else {
      queues.set(key, [audit]);
    }
  }
  const matched = new Map<string, AuditRow>();
  for (const change of decided) {
    const action = change.status === "approved" ? "approve" : "reject";
    const queue = queues.get(auditKey(action, tableFor(change.type), change.before, change.after));
    if (!queue || queue.length === 0) {
      continue;
    }
    let at = 0;
    if (change.targetId !== null) {
      const exact = queue.findIndex((audit) => audit.rowId === change.targetId);
      if (exact >= 0) {
        at = exact;
      }
    }
    matched.set(change.id, queue.splice(at, 1)[0]!);
  }
  return matched;
}

/** `Acme sync: go-live moves...` -> `Acme sync`; anything else is truncated, never blanked. */
export function meetingLabelFor(summary: string, zoneId: string): string {
  const head = summary.split(":")[0]!.trim().slice(0, 48);
  return head.length > 0 ? head : zoneId;
}

/**
 * The decider's display name. Postgres actor ids match `people` ids exactly; in-memory dev
 * auth mints `dev-<key>` ids while `people` carries the bare keys, so the prefix is
 * stripped as a fallback. Unknown ids (a custom dev name) are prettified, never blanked.
 */
export function deciderNameFor(people: PersonRef[], actorId: string): string {
  const exact = people.find((person) => person.id === actorId);
  if (exact) {
    return exact.name;
  }
  const bare = actorId.startsWith("dev-") ? actorId.slice(4) : actorId;
  const byKey = people.find((person) => person.id === bare);
  if (byKey) {
    return byKey.name;
  }
  return bare
    .split("-")
    .filter((part) => part.length > 0)
    .map((part) => part[0]!.toUpperCase() + part.slice(1))
    .join(" ");
}

interface RecordScope {
  recordType: AskSourceType;
  recordId: string;
  recordLabel: string;
  accountId: string | null;
  projectId: string | null;
}

function afterStr(after: Record<string, unknown>, field: string): string | null {
  const value = after[field];
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * The record a decided change touched, with its label and its account/project scope.
 * Approved creates resolve through the audit row's new-record id; a rejected create has
 * no record, so it keeps the change id (a stable UUID) and the label from its `after`.
 * Answers null when the record is gone: no receipt is better than a fabricated one.
 */
async function resolveRecord(
  repo: Repo,
  claims: AuthClaims,
  change: ProposedChange,
  audit: AuditRow,
): Promise<RecordScope | null> {
  const after = change.after as Record<string, unknown>;
  switch (change.type) {
    case "milestone_date": {
      if (!change.targetId) {
        return null;
      }
      const record = await repo.milestone(claims, change.targetId);
      if (!record) {
        return null;
      }
      const project = await repo.project(claims, record.projectId);
      return {
        recordType: "milestone",
        recordId: record.id,
        recordLabel: record.name,
        accountId: project?.accountId ?? null,
        projectId: record.projectId,
      };
    }
    case "commitment_update": {
      if (!change.targetId) {
        return null;
      }
      const record = await repo.commitment(claims, change.targetId);
      if (!record) {
        return null;
      }
      const milestone = record.linkedMilestoneId
        ? await repo.milestone(claims, record.linkedMilestoneId)
        : null;
      return {
        recordType: "commitment",
        recordId: record.id,
        recordLabel: record.text,
        accountId: record.accountId,
        projectId: milestone?.projectId ?? null,
      };
    }
    case "commitment_create": {
      if (change.status === "approved") {
        const record = await repo.commitment(claims, audit.rowId);
        if (!record) {
          return null;
        }
        const milestone = record.linkedMilestoneId
          ? await repo.milestone(claims, record.linkedMilestoneId)
          : null;
        return {
          recordType: "commitment",
          recordId: record.id,
          recordLabel: record.text,
          accountId: record.accountId,
          projectId: milestone?.projectId ?? null,
        };
      }
      return {
        recordType: "commitment",
        recordId: change.id,
        recordLabel: afterStr(after, "text") ?? "commitment",
        accountId: afterStr(after, "accountId"),
        projectId: null,
      };
    }
    case "task_create": {
      if (change.status === "approved") {
        const record = await repo.task(claims, audit.rowId);
        if (!record) {
          return null;
        }
        const project = record.projectId ? await repo.project(claims, record.projectId) : null;
        return {
          recordType: "task",
          recordId: record.id,
          recordLabel: record.title,
          accountId: record.accountId ?? project?.accountId ?? null,
          projectId: record.projectId,
        };
      }
      return {
        recordType: "task",
        recordId: change.id,
        recordLabel: afterStr(after, "title") ?? "task",
        accountId: afterStr(after, "accountId"),
        projectId: afterStr(after, "projectId"),
      };
    }
    case "task_update":
    case "task_reassign": {
      if (!change.targetId) {
        return null;
      }
      const record = await repo.task(claims, change.targetId);
      if (!record) {
        return null;
      }
      const project = record.projectId ? await repo.project(claims, record.projectId) : null;
      return {
        recordType: "task",
        recordId: record.id,
        recordLabel: record.title,
        accountId: record.accountId ?? project?.accountId ?? null,
        projectId: record.projectId,
      };
    }
  }
}

/**
 * One receipt per decided change, newest first, filtered by the query. A decided change
 * without its audit row (or whose record is gone) contributes no receipt: the audit row
 * is what names the decider and the time.
 */
export async function composeReceipts(
  repo: Repo,
  claims: AuthClaims,
  query: ReceiptQuery,
): Promise<ReceiptData[]> {
  const [changes, audits, meetings, people] = await Promise.all([
    repo.changes(claims),
    repo.audit(claims),
    repo.meetings(claims),
    repo.people(claims),
  ]);
  const decided = changes.filter((change) => change.status !== "pending");
  const matched = matchAudits(decided, audits);
  const receipts: ReceiptData[] = [];
  for (const change of decided) {
    const audit = matched.get(change.id);
    if (!audit) {
      continue;
    }
    const record = await resolveRecord(repo, claims, change, audit);
    if (!record) {
      continue;
    }
    if (query.accountId !== undefined && record.accountId !== query.accountId) {
      continue;
    }
    if (query.projectId !== undefined && record.projectId !== query.projectId) {
      continue;
    }
    const meeting = meetings.find((item) => item.id === change.sourceMeetingId);
    const parsed = Receipt.safeParse({
      changeId: change.id,
      kind: change.type,
      recordType: record.recordType,
      recordId: record.recordId,
      recordLabel: record.recordLabel,
      before: change.before,
      after: change.after,
      meetingId: change.sourceMeetingId,
      meetingLabel: meeting ? meetingLabelFor(meeting.summary, meeting.zoneId) : "Meeting",
      decision: change.status,
      deciderId: audit.actorId,
      deciderName: deciderNameFor(people, audit.actorId),
      decidedAt: audit.ts,
    });
    if (parsed.success) {
      receipts.push(parsed.data);
    }
  }
  receipts.sort((a, b) => b.decidedAt - a.decidedAt || (a.changeId < b.changeId ? -1 : 1));
  return query.limit === undefined ? receipts : receipts.slice(0, query.limit);
}
