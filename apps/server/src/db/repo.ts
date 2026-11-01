import { randomUUID } from "node:crypto";
import {
  DEMO_ACCOUNT,
  DEMO_COMMITMENT,
  DEMO_CONTACT,
  DEMO_MILESTONE,
  DEMO_PEOPLE,
  DEMO_PROJECT,
  DEMO_TASKS,
  WORKSPACE_ID,
  type Account,
  type AuthClaims,
  type ChatMessage,
  type Commitment,
  type Contact,
  type Decision,
  type Meeting,
  type Milestone,
  type PersonRef,
  type Project,
  type ProposedChange,
  type ProposedChangeQuery,
  type Task,
} from "@office/shared";
import { UnauthorizedError } from "../auth/verify.js";

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

/** Approving or rejecting a change that is no longer pending (P3-B turns this into 409). */
export class NotPendingError extends Error {
  readonly changeId: string;

  constructor(changeId: string) {
    super(`change ${changeId} is no longer pending`);
    this.name = "NotPendingError";
    this.changeId = changeId;
  }
}

export interface Membership {
  userId: string;
  workspaceId: string;
  role: string;
}

export interface AuditRow {
  id: string;
  workspaceId: string;
  actorId: string;
  action: "approve" | "reject";
  table: string;
  rowId: string;
  before: unknown;
  after: unknown;
  ts: number;
}

export interface TaskFilter {
  projectId?: string;
  accountId?: string;
  ownerId?: string;
}

export interface MeetingInput {
  zoneId: string;
  transcript: string;
  summary: string;
  decisions: Decision[];
}

/**
 * The server's data access (ARCHITECTURE.md 12.4). Every call takes the caller's `AuthClaims`;
 * reads are scoped to the claims' workspace and writes check membership first. `approveChange`
 * and `rejectChange` each apply in one transaction (in memory here; Postgres in P2-C).
 */
export interface Repo {
  member(claims: AuthClaims): Promise<Membership | null>;
  people(claims: AuthClaims): Promise<PersonRef[]>;
  account(claims: AuthClaims, id: string): Promise<Account | null>;
  accounts(claims: AuthClaims): Promise<Account[]>;
  contacts(claims: AuthClaims, accountId: string): Promise<Contact[]>;
  project(claims: AuthClaims, id: string): Promise<Project | null>;
  projects(claims: AuthClaims): Promise<Project[]>;
  milestone(claims: AuthClaims, id: string): Promise<Milestone | null>;
  milestones(claims: AuthClaims, projectId: string): Promise<Milestone[]>;
  task(claims: AuthClaims, id: string): Promise<Task | null>;
  tasks(claims: AuthClaims, filter?: TaskFilter): Promise<Task[]>;
  commitment(claims: AuthClaims, id: string): Promise<Commitment | null>;
  commitments(claims: AuthClaims, accountId: string): Promise<Commitment[]>;
  createMeeting(claims: AuthClaims, input: MeetingInput): Promise<Meeting>;
  meeting(claims: AuthClaims, id: string): Promise<Meeting | null>;
  meetings(claims: AuthClaims): Promise<Meeting[]>;
  saveChanges(claims: AuthClaims, changes: ProposedChange[]): Promise<void>;
  change(claims: AuthClaims, id: string): Promise<ProposedChange | null>;
  changes(claims: AuthClaims, query?: ProposedChangeQuery): Promise<ProposedChange[]>;
  approveChange(claims: AuthClaims, id: string): Promise<void>;
  rejectChange(claims: AuthClaims, id: string): Promise<void>;
  audit(claims: AuthClaims): Promise<AuditRow[]>;
  saveChat(claims: AuthClaims, input: { name: string; text: string }): Promise<ChatMessage>;
  chat(claims: AuthClaims, limit?: number): Promise<ChatMessage[]>;
}

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

/** In-memory repo over the shared demo data, used until P2-C lands the Postgres repo. */
export class InMemoryRepo implements Repo {
  private readonly accountsById = new Map<string, Account>();
  private readonly contactsList: Contact[] = [];
  private readonly projectsById = new Map<string, Project>();
  private readonly milestonesById = new Map<string, Milestone>();
  private readonly tasksById = new Map<string, Task>();
  private readonly commitmentsById = new Map<string, Commitment>();
  private readonly meetingsById = new Map<string, Meeting>();
  private readonly changesById = new Map<string, ProposedChange>();
  private readonly auditRows: AuditRow[] = [];
  private readonly chatMessages: ChatMessage[] = [];

  constructor() {
    this.accountsById.set(DEMO_ACCOUNT.id, structuredClone(DEMO_ACCOUNT));
    this.contactsList.push(structuredClone(DEMO_CONTACT));
    this.projectsById.set(DEMO_PROJECT.id, structuredClone(DEMO_PROJECT));
    this.milestonesById.set(DEMO_MILESTONE.id, structuredClone(DEMO_MILESTONE));
    for (const task of DEMO_TASKS) {
      this.tasksById.set(task.id, structuredClone(task));
    }
    this.commitmentsById.set(DEMO_COMMITMENT.id, structuredClone(DEMO_COMMITMENT));
  }

  private allowed(claims: AuthClaims): boolean {
    return claims.workspaceId === WORKSPACE_ID;
  }

  private checkMember(claims: AuthClaims): void {
    if (!this.allowed(claims)) {
      throw new UnauthorizedError("not a member of this workspace");
    }
  }

  async member(claims: AuthClaims): Promise<Membership | null> {
    if (!this.allowed(claims)) {
      return null;
    }
    return { userId: claims.userId, workspaceId: claims.workspaceId, role: "member" };
  }

  async people(claims: AuthClaims): Promise<PersonRef[]> {
    if (!this.allowed(claims)) {
      return [];
    }
    return DEMO_PEOPLE.map((p) => ({ id: p.key, name: p.name }));
  }

  async account(claims: AuthClaims, id: string): Promise<Account | null> {
    if (!this.allowed(claims)) {
      return null;
    }
    return structuredClone(this.accountsById.get(id) ?? null);
  }

  async accounts(claims: AuthClaims): Promise<Account[]> {
    if (!this.allowed(claims)) {
      return [];
    }
    return structuredClone([...this.accountsById.values()]);
  }

  async contacts(claims: AuthClaims, accountId: string): Promise<Contact[]> {
    if (!this.allowed(claims)) {
      return [];
    }
    return structuredClone(this.contactsList.filter((c) => c.accountId === accountId));
  }

  async project(claims: AuthClaims, id: string): Promise<Project | null> {
    if (!this.allowed(claims)) {
      return null;
    }
    return structuredClone(this.projectsById.get(id) ?? null);
  }

  async projects(claims: AuthClaims): Promise<Project[]> {
    if (!this.allowed(claims)) {
      return [];
    }
    return structuredClone([...this.projectsById.values()]);
  }

  async milestone(claims: AuthClaims, id: string): Promise<Milestone | null> {
    if (!this.allowed(claims)) {
      return null;
    }
    return structuredClone(this.milestonesById.get(id) ?? null);
  }

  async milestones(claims: AuthClaims, projectId: string): Promise<Milestone[]> {
    if (!this.allowed(claims)) {
      return [];
    }
    return structuredClone([...this.milestonesById.values()].filter((m) => m.projectId === projectId));
  }

  async task(claims: AuthClaims, id: string): Promise<Task | null> {
    if (!this.allowed(claims)) {
      return null;
    }
    return structuredClone(this.tasksById.get(id) ?? null);
  }

  async tasks(claims: AuthClaims, filter: TaskFilter = {}): Promise<Task[]> {
    if (!this.allowed(claims)) {
      return [];
    }
    return structuredClone(
      [...this.tasksById.values()].filter(
        (t) =>
          (filter.projectId === undefined || t.projectId === filter.projectId) &&
          (filter.accountId === undefined || t.accountId === filter.accountId) &&
          (filter.ownerId === undefined || t.ownerId === filter.ownerId),
      ),
    );
  }

  async commitment(claims: AuthClaims, id: string): Promise<Commitment | null> {
    if (!this.allowed(claims)) {
      return null;
    }
    return structuredClone(this.commitmentsById.get(id) ?? null);
  }

  async commitments(claims: AuthClaims, accountId: string): Promise<Commitment[]> {
    if (!this.allowed(claims)) {
      return [];
    }
    return structuredClone(
      [...this.commitmentsById.values()].filter((c) => c.accountId === accountId),
    );
  }

  async createMeeting(claims: AuthClaims, input: MeetingInput): Promise<Meeting> {
    this.checkMember(claims);
    const meeting: Meeting = {
      id: randomUUID(),
      zoneId: input.zoneId,
      startedAt: Date.now(),
      transcript: input.transcript,
      summary: input.summary,
      decisions: structuredClone(input.decisions),
    };
    this.meetingsById.set(meeting.id, meeting);
    return structuredClone(meeting);
  }

  async meeting(claims: AuthClaims, id: string): Promise<Meeting | null> {
    if (!this.allowed(claims)) {
      return null;
    }
    return structuredClone(this.meetingsById.get(id) ?? null);
  }

  async meetings(claims: AuthClaims): Promise<Meeting[]> {
    if (!this.allowed(claims)) {
      return [];
    }
    return structuredClone([...this.meetingsById.values()]);
  }

  async saveChanges(claims: AuthClaims, changes: ProposedChange[]): Promise<void> {
    this.checkMember(claims);
    for (const change of changes) {
      this.changesById.set(change.id, structuredClone(change));
    }
  }

  async change(claims: AuthClaims, id: string): Promise<ProposedChange | null> {
    if (!this.allowed(claims)) {
      return null;
    }
    return structuredClone(this.changesById.get(id) ?? null);
  }

  async changes(claims: AuthClaims, query: ProposedChangeQuery = {}): Promise<ProposedChange[]> {
    if (!this.allowed(claims)) {
      return [];
    }
    return structuredClone(
      [...this.changesById.values()].filter(
        (c) =>
          (query.status === undefined || c.status === query.status) &&
          (query.meetingId === undefined || c.sourceMeetingId === query.meetingId),
      ),
    );
  }

  async approveChange(claims: AuthClaims, id: string): Promise<void> {
    this.checkMember(claims);
    const change = this.changesById.get(id);
    if (!change) {
      throw new NotFoundError(`unknown change ${id}`);
    }
    if (change.status !== "pending") {
      throw new NotPendingError(id);
    }
    const rowId = this.applyChange(change);
    change.status = "approved";
    this.auditRows.push({
      id: randomUUID(),
      workspaceId: claims.workspaceId,
      actorId: claims.userId,
      action: "approve",
      table: tableFor(change.type),
      rowId,
      before: change.before,
      after: change.after,
      ts: Date.now(),
    });
  }

  async rejectChange(claims: AuthClaims, id: string): Promise<void> {
    this.checkMember(claims);
    const change = this.changesById.get(id);
    if (!change) {
      throw new NotFoundError(`unknown change ${id}`);
    }
    if (change.status !== "pending") {
      throw new NotPendingError(id);
    }
    change.status = "rejected";
    this.auditRows.push({
      id: randomUUID(),
      workspaceId: claims.workspaceId,
      actorId: claims.userId,
      action: "reject",
      table: tableFor(change.type),
      rowId: change.targetId ?? "",
      before: change.before,
      after: change.after,
      ts: Date.now(),
    });
  }

  async audit(claims: AuthClaims): Promise<AuditRow[]> {
    if (!this.allowed(claims)) {
      return [];
    }
    return structuredClone(this.auditRows);
  }

  async saveChat(claims: AuthClaims, input: { name: string; text: string }): Promise<ChatMessage> {
    this.checkMember(claims);
    const message: ChatMessage = {
      id: randomUUID(),
      userId: claims.userId,
      name: input.name,
      text: input.text,
      ts: Date.now(),
    };
    this.chatMessages.push(message);
    return structuredClone(message);
  }

  async chat(claims: AuthClaims, limit = 50): Promise<ChatMessage[]> {
    if (!this.allowed(claims)) {
      return [];
    }
    return structuredClone(this.chatMessages.slice(-limit));
  }

  /** Applies one pending change to the records; answers the id of the row it touched. */
  private applyChange(change: ProposedChange): string {
    const after = change.after as Record<string, unknown>;
    const str = (value: unknown): string => {
      if (typeof value !== "string" || !value) {
        throw new NotFoundError(`change ${change.id} carries an invalid value`);
      }
      return value;
    };
    switch (change.type) {
      case "milestone_date": {
        const milestone = change.targetId ? this.milestonesById.get(change.targetId) : undefined;
        if (!milestone) {
          throw new NotFoundError(`change ${change.id} matches no milestone`);
        }
        milestone.targetDate = str(after["targetDate"]);
        milestone.sourceMeetingId = change.sourceMeetingId;
        return milestone.id;
      }
      case "commitment_update": {
        const commitment = change.targetId ? this.commitmentsById.get(change.targetId) : undefined;
        if (!commitment) {
          throw new NotFoundError(`change ${change.id} matches no commitment`);
        }
        if (after["text"] !== undefined) {
          commitment.text = str(after["text"]);
        }
        if (after["dueDate"] !== undefined) {
          commitment.dueDate = after["dueDate"] as string | null;
        }
        commitment.sourceMeetingId = change.sourceMeetingId;
        return commitment.id;
      }
      case "commitment_create": {
        const commitment: Commitment = {
          id: randomUUID(),
          accountId: str(after["accountId"]),
          text: str(after["text"]),
          dueDate: (after["dueDate"] as string | null | undefined) ?? null,
          linkedTaskId: (after["linkedTaskId"] as string | null | undefined) ?? null,
          linkedMilestoneId: (after["linkedMilestoneId"] as string | null | undefined) ?? null,
          sourceMeetingId: change.sourceMeetingId,
        };
        this.commitmentsById.set(commitment.id, commitment);
        return commitment.id;
      }
      case "task_create": {
        const task: Task = {
          id: randomUUID(),
          projectId: (after["projectId"] as string | null | undefined) ?? null,
          accountId: (after["accountId"] as string | null | undefined) ?? null,
          title: str(after["title"]),
          ownerId: (after["ownerId"] as string | null | undefined) ?? null,
          dueDate: (after["dueDate"] as string | null | undefined) ?? null,
          status: (after["status"] as Task["status"] | undefined) ?? "todo",
          blockedReason: (after["blockedReason"] as string | null | undefined) ?? null,
          sourceMeetingId: change.sourceMeetingId,
        };
        this.tasksById.set(task.id, task);
        return task.id;
      }
      case "task_update": {
        const task = change.targetId ? this.tasksById.get(change.targetId) : undefined;
        if (!task) {
          throw new NotFoundError(`change ${change.id} matches no task`);
        }
        if (after["title"] !== undefined) {
          task.title = str(after["title"]);
        }
        if (after["ownerId"] !== undefined) {
          task.ownerId = after["ownerId"] as string | null;
        }
        if (after["dueDate"] !== undefined) {
          task.dueDate = after["dueDate"] as string | null;
        }
        if (after["status"] !== undefined) {
          task.status = after["status"] as Task["status"];
        }
        if (after["blockedReason"] !== undefined) {
          task.blockedReason = after["blockedReason"] as string | null;
        }
        task.sourceMeetingId = change.sourceMeetingId;
        return task.id;
      }
      case "task_reassign": {
        const task = change.targetId ? this.tasksById.get(change.targetId) : undefined;
        if (!task) {
          throw new NotFoundError(`change ${change.id} matches no task`);
        }
        task.ownerId = str(after["ownerId"]);
        task.sourceMeetingId = change.sourceMeetingId;
        return task.id;
      }
    }
  }
}

export function createInMemoryRepo(): Repo {
  return new InMemoryRepo();
}
