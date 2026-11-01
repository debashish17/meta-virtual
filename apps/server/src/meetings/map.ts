import { randomUUID } from "node:crypto";
import {
  ROOM_RECORDS,
  type Account,
  type Commitment,
  type ExtractionResult,
  type Milestone,
  type PersonRef,
  type Project,
  type ProposedChange,
  type Task,
} from "@office/shared";

/** The records the mapping matches extracted names against (P3-B reads them from the `Repo`). */
export interface RecordsSnapshot {
  accounts: Account[];
  projects: Project[];
  milestones: Milestone[];
  tasks: Task[];
  commitments: Commitment[];
  people: PersonRef[];
}

export interface MapOptions {
  /** The meeting's room: narrows matching through `ROOM_RECORDS`. */
  zoneId: string;
  meetingId: string;
  nextId?: () => string;
}

function norm(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Exact normalised match, else the single candidate containing (or contained in) the name. */
function matchByName<T>(candidates: T[], names: (item: T) => string[], wanted: string): T | null {
  const target = norm(wanted);
  const exact = candidates.find((item) => names(item).some((name) => norm(name) === target));
  if (exact !== undefined) {
    return exact;
  }
  const loose = candidates.filter((item) =>
    names(item).some((name) => {
      const candidate = norm(name);
      return candidate.includes(target) || target.includes(candidate);
    }),
  );
  return loose.length === 1 ? loose[0] : null;
}

function tokens(value: string): Set<string> {
  return new Set(
    norm(value)
      .split(/[^a-z0-9-]+/g)
      .filter((token) => token.length > 0),
  );
}

function sharedTokens(a: string, b: string): number {
  const left = tokens(a);
  let shared = 0;
  for (const token of tokens(b)) {
    if (left.has(token)) {
      shared += 1;
    }
  }
  return shared;
}

interface RoomScope {
  accountId: string | null;
  projectId: string | null;
}

function roomScope(zoneId: string, snapshot: RecordsSnapshot): RoomScope {
  const room = ROOM_RECORDS[zoneId];
  if (!room) {
    return { accountId: null, projectId: null };
  }
  if (room.kind === "project") {
    const project = snapshot.projects.find((p) => p.id === room.recordId) ?? null;
    return { accountId: project?.accountId ?? null, projectId: room.recordId };
  }
  return { accountId: room.recordId, projectId: null };
}

function projectsInScope(snapshot: RecordsSnapshot, scope: RoomScope): Project[] {
  if (scope.projectId) {
    return snapshot.projects.filter((p) => p.id === scope.projectId);
  }
  if (scope.accountId) {
    return snapshot.projects.filter((p) => p.accountId === scope.accountId);
  }
  return snapshot.projects;
}

function tasksInScope(snapshot: RecordsSnapshot, scope: RoomScope): Task[] {
  if (scope.projectId) {
    return snapshot.tasks.filter((t) => t.projectId === scope.projectId);
  }
  if (scope.accountId) {
    const projectIds = new Set(
      snapshot.projects.filter((p) => p.accountId === scope.accountId).map((p) => p.id),
    );
    return snapshot.tasks.filter(
      (t) =>
        t.accountId === scope.accountId || (t.projectId !== null && projectIds.has(t.projectId)),
    );
  }
  return snapshot.tasks;
}

function commitmentsInScope(snapshot: RecordsSnapshot, scope: RoomScope): Commitment[] {
  if (!scope.accountId) {
    return snapshot.commitments;
  }
  return snapshot.commitments.filter((c) => c.accountId === scope.accountId);
}

function findPerson(people: PersonRef[], ownerName: string): PersonRef | null {
  return matchByName(people, (p) => [p.name, p.id], ownerName);
}

/**
 * Maps an extraction to proposed changes against a records snapshot (pure). The meeting's
 * room narrows the matching; anything that does not match confidently becomes a change
 * with `targetId` null and `needsReview` true, carrying the extracted names for the reviewer.
 */
export function mapExtractionToChanges(
  extraction: ExtractionResult,
  snapshot: RecordsSnapshot,
  options: MapOptions,
): ProposedChange[] {
  const nextId = options.nextId ?? randomUUID;
  const scope = roomScope(options.zoneId, snapshot);
  const changes: ProposedChange[] = [];

  for (const item of extraction.milestoneChanges) {
    changes.push(mapMilestoneChange(item, snapshot, scope, options.meetingId, nextId()));
  }
  for (const item of extraction.commitments) {
    changes.push(mapCommitment(item, snapshot, scope, options.meetingId, nextId()));
  }
  for (const item of extraction.tasks) {
    changes.push(...mapTask(item, snapshot, scope, options.meetingId, nextId));
  }
  return changes;
}

function mapMilestoneChange(
  item: ExtractionResult["milestoneChanges"][number],
  snapshot: RecordsSnapshot,
  scope: RoomScope,
  meetingId: string,
  id: string,
): ProposedChange {
  const base = { id, type: "milestone_date", status: "pending", sourceMeetingId: meetingId } as const;
  const project = matchByName(
    projectsInScope(snapshot, scope),
    (p) => [p.name],
    item.projectName,
  );
  const milestone =
    project === null
      ? null
      : matchByName(
          snapshot.milestones.filter((m) => m.projectId === project.id),
          (m) => [m.name],
          item.milestoneName,
        );
  if (project === null || milestone === null) {
    return {
      ...base,
      targetId: null,
      before: null,
      after: {
        projectName: item.projectName,
        milestoneName: item.milestoneName,
        newTargetDate: item.newTargetDate,
      },
      needsReview: true,
    };
  }
  return {
    ...base,
    targetId: milestone.id,
    before: { targetDate: milestone.targetDate },
    after: { targetDate: item.newTargetDate },
    needsReview: false,
  };
}

function mapCommitment(
  item: ExtractionResult["commitments"][number],
  snapshot: RecordsSnapshot,
  scope: RoomScope,
  meetingId: string,
  id: string,
): ProposedChange {
  const scoped = commitmentsInScope(snapshot, scope);
  const account = matchByName(
    scope.accountId ? snapshot.accounts.filter((a) => a.id === scope.accountId) : snapshot.accounts,
    (a) => [a.name],
    item.accountName,
  );
  if (account === null) {
    return {
      id,
      type: "commitment_create",
      status: "pending",
      targetId: null,
      before: null,
      after: { accountName: item.accountName, text: item.text, dueDate: item.dueDate ?? null },
      needsReview: true,
      sourceMeetingId: meetingId,
    };
  }
  const candidates = scoped.filter((c) => c.accountId === account.id);
  const same = candidates.find((c) => norm(c.text) === norm(item.text)) ?? null;
  const restated =
    same ??
    (candidates.length === 1 && sharedTokens(candidates[0].text, item.text) >= 2
      ? candidates[0]
      : null);
  if (restated === null) {
    return {
      id,
      type: "commitment_create",
      status: "pending",
      targetId: null,
      before: null,
      after: { accountId: account.id, text: item.text, dueDate: item.dueDate ?? null },
      needsReview: false,
      sourceMeetingId: meetingId,
    };
  }
  const after: Record<string, unknown> = { text: item.text };
  if (item.dueDate !== undefined) {
    after["dueDate"] = item.dueDate;
  }
  return {
    id,
    type: "commitment_update",
    status: "pending",
    targetId: restated.id,
    before: { text: restated.text, dueDate: restated.dueDate },
    after,
    needsReview: false,
    sourceMeetingId: meetingId,
  };
}

function mapTask(
  item: ExtractionResult["tasks"][number],
  snapshot: RecordsSnapshot,
  scope: RoomScope,
  meetingId: string,
  nextId: () => string,
): ProposedChange[] {
  if (item.action === "create") {
    return [mapTaskCreate(item, snapshot, scope, meetingId, nextId())];
  }
  return mapTaskUpdate(item, snapshot, scope, meetingId, nextId);
}

function taskHome(
  snapshot: RecordsSnapshot,
  scope: RoomScope,
): { projectId: string | null; accountId: string | null; review: boolean } {
  if (scope.projectId) {
    return { projectId: scope.projectId, accountId: null, review: false };
  }
  if (scope.accountId) {
    const projects = projectsInScope(snapshot, scope);
    if (projects.length === 1) {
      return { projectId: projects[0].id, accountId: null, review: false };
    }
    return { projectId: null, accountId: scope.accountId, review: projects.length !== 0 };
  }
  const projects = snapshot.projects;
  if (projects.length === 1) {
    return { projectId: projects[0].id, accountId: null, review: true };
  }
  return { projectId: null, accountId: null, review: true };
}

function mapTaskCreate(
  item: ExtractionResult["tasks"][number],
  snapshot: RecordsSnapshot,
  scope: RoomScope,
  meetingId: string,
  id: string,
): ProposedChange {
  const owner = item.ownerName ? findPerson(snapshot.people, item.ownerName) : null;
  const home = taskHome(snapshot, scope);
  const after: Record<string, unknown> = {
    title: item.title,
    ownerId: owner?.id ?? null,
    projectId: home.projectId,
    status: "todo",
  };
  if (home.accountId) {
    after["accountId"] = home.accountId;
  }
  if (item.dueDate !== undefined) {
    after["dueDate"] = item.dueDate;
  }
  return {
    id,
    type: "task_create",
    status: "pending",
    targetId: null,
    before: null,
    after,
    needsReview: (item.ownerName !== undefined && owner === null) || home.review,
    sourceMeetingId: meetingId,
  };
}

function mapTaskUpdate(
  item: ExtractionResult["tasks"][number],
  snapshot: RecordsSnapshot,
  scope: RoomScope,
  meetingId: string,
  nextId: () => string,
): ProposedChange[] {
  const task = matchByName(
    tasksInScope(snapshot, scope),
    (t) => [t.title],
    item.matchHint ?? item.title,
  );
  if (task === null) {
    return [
      {
        id: nextId(),
        type: "task_update",
        status: "pending",
        targetId: null,
        before: null,
        after: {
          title: item.title,
          ownerName: item.ownerName ?? null,
          dueDate: item.dueDate ?? null,
          matchHint: item.matchHint ?? null,
        },
        needsReview: true,
        sourceMeetingId: meetingId,
      },
    ];
  }
  const changes: ProposedChange[] = [];
  const owner = item.ownerName ? findPerson(snapshot.people, item.ownerName) : undefined;
  if (item.ownerName !== undefined) {
    if (owner && owner.id !== task.ownerId) {
      changes.push({
        id: nextId(),
        type: "task_reassign",
        status: "pending",
        targetId: task.id,
        before: { ownerId: task.ownerId },
        after: { ownerId: owner.id },
        needsReview: false,
        sourceMeetingId: meetingId,
      });
    } else if (!owner) {
      changes.push({
        id: nextId(),
        type: "task_reassign",
        status: "pending",
        targetId: task.id,
        before: { ownerId: task.ownerId },
        after: { ownerName: item.ownerName },
        needsReview: true,
        sourceMeetingId: meetingId,
      });
    }
  }
  const updateAfter: Record<string, unknown> = {};
  if (item.dueDate !== undefined && item.dueDate !== task.dueDate) {
    updateAfter["dueDate"] = item.dueDate;
  }
  if (norm(item.title) !== norm(task.title)) {
    updateAfter["title"] = item.title;
  }
  if (Object.keys(updateAfter).length > 0) {
    const before: Record<string, unknown> = {};
    if ("dueDate" in updateAfter) {
      before["dueDate"] = task.dueDate;
    }
    if ("title" in updateAfter) {
      before["title"] = task.title;
    }
    changes.push({
      id: nextId(),
      type: "task_update",
      status: "pending",
      targetId: task.id,
      before,
      after: updateAfter,
      needsReview: false,
      sourceMeetingId: meetingId,
    });
  }
  return changes;
}
