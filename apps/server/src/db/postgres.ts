import { randomUUID } from "node:crypto";
import {
  Account,
  ChatMessage,
  Commitment,
  Contact,
  Meeting,
  Milestone,
  Project,
  ProposedChange,
  Task,
  type AuthClaims,
  type Meeting as MeetingType,
  type PersonRef,
  type ProposedChangeQuery,
} from "@office/shared";
import postgres, { type Row, type Sql, type TransactionSql } from "postgres";
import { UnauthorizedError } from "../auth/verify.js";
import {
  NotFoundError,
  NotPendingError,
  type AuditRow,
  type MeetingInput,
  type Membership,
  type Repo,
  type TaskFilter,
} from "./repo.js";

/** The transaction client `postgres.js` hands to `sql.begin` callbacks. */
type Tx = TransactionSql;

/**
 * Serializes one jsonb parameter. postgres.js JSON-encodes a pre-stringified
 * value a second time (storing a JSON string), so objects go through `tx.json`.
 * Values come from Zod-parsed contracts, so they are always plain JSON.
 */
function asJson(tx: Tx, value: unknown): ReturnType<Tx["json"]> {
  return tx.json(value as Parameters<Tx["json"]>[0]);
}

/**
 * True when the URL points at a transaction-mode pooler (Supavisor `:6543`, or
 * an explicit pgbouncer/pooler flag), where prepared statements must be off.
 */
export function isPoolerUrl(databaseUrl: string): boolean {
  return /:(6543)\b|[?&](pgbouncer|pooler|pool_mode)=|pooler\./i.test(databaseUrl);
}

export interface PostgresRepoOptions {
  /** Override the automatic `prepare: !isPoolerUrl(url)` detection. */
  prepare?: boolean;
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

function reqStr(changeId: string, value: unknown): string {
  if (typeof value !== "string" || !value) {
    throw new NotFoundError(`change ${changeId} carries an invalid value`);
  }
  return value;
}

function optStr(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/** BIGINT comes back as bigint, number or string depending on driver settings. */
function ms(value: unknown): number {
  return Number(value);
}

function mapAccount(row: Row): Account {
  return Account.parse({
    id: row["id"],
    name: row["name"],
    dealStage: row["deal_stage"],
    ownerId: row["owner_id"],
  });
}

function mapContact(row: Row): Contact {
  return Contact.parse({
    id: row["id"],
    accountId: row["account_id"],
    name: row["name"],
    role: row["role"],
  });
}

function mapProject(row: Row): Project {
  return Project.parse({
    id: row["id"],
    accountId: row["account_id"],
    name: row["name"],
    ownerId: row["owner_id"],
  });
}

function mapMilestone(row: Row): Milestone {
  return Milestone.parse({
    id: row["id"],
    projectId: row["project_id"],
    name: row["name"],
    targetDate: row["target_date"],
    status: row["status"],
    sourceMeetingId: row["source_meeting_id"],
  });
}

function mapTask(row: Row): Task {
  return Task.parse({
    id: row["id"],
    projectId: row["project_id"],
    accountId: row["account_id"],
    title: row["title"],
    ownerId: row["owner_id"],
    dueDate: row["due_date"],
    status: row["status"],
    blockedReason: row["blocked_reason"],
    sourceMeetingId: row["source_meeting_id"],
  });
}

function mapCommitment(row: Row): Commitment {
  return Commitment.parse({
    id: row["id"],
    accountId: row["account_id"],
    text: row["text"],
    dueDate: row["due_date"],
    linkedTaskId: row["linked_task_id"],
    linkedMilestoneId: row["linked_milestone_id"],
    sourceMeetingId: row["source_meeting_id"],
  });
}

function mapMeeting(row: Row): MeetingType {
  return Meeting.parse({
    id: row["id"],
    zoneId: row["zone_id"],
    startedAt: ms(row["started_at"]),
    transcript: row["transcript"],
    summary: row["summary"],
    decisions: row["decisions"],
  });
}

function mapChange(row: Row): ProposedChange {
  return ProposedChange.parse({
    id: row["id"],
    type: row["type"],
    status: row["status"],
    targetId: row["target_id"],
    before: row["before"],
    after: row["after"],
    needsReview: row["needs_review"],
    sourceMeetingId: row["meeting_id"],
  });
}

function mapAudit(row: Row): AuditRow {
  return {
    id: String(row["id"]),
    workspaceId: String(row["workspace_id"]),
    actorId: String(row["actor_id"]),
    action: row["action"] as AuditRow["action"],
    table: String(row["table_name"]),
    rowId: String(row["row_id"]),
    before: row["before"],
    after: row["after"],
    ts: ms(row["ts"]),
  };
}

function mapChat(row: Row): ChatMessage {
  return ChatMessage.parse({
    id: String(row["id"]),
    userId: String(row["user_id"]),
    name: String(row["name"]),
    text: String(row["text"]),
    ts: ms(row["ts"]),
  });
}

/**
 * The `Repo` on postgres.js (ARCHITECTURE.md 12.4). Reads run as the caller
 * through `withUser`, so RLS applies to the server's own reads; writes run
 * under the connection's own role through `withService`, only after an
 * explicit membership check, and still name `workspace_id` in every statement.
 */
export class PostgresRepo implements Repo {
  private readonly sql: Sql;

  constructor(sql: Sql) {
    this.sql = sql;
  }

  /** Releases the pool. Tests call this in `afterAll`. */
  async close(): Promise<void> {
    await this.sql.end();
  }

  async withUser<T>(claims: AuthClaims, fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.sql.begin(async (tx) => {
      await tx`SET LOCAL ROLE authenticated`;
      await tx`SELECT set_config('request.jwt.claims', ${JSON.stringify({ sub: claims.userId })}, true)`;
      return fn(tx as Tx);
    });
  }

  async withService<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.sql.begin(async (tx) => fn(tx as Tx));
  }

  private async requireMember(tx: Tx, claims: AuthClaims): Promise<void> {
    const rows = await tx`
      SELECT 1 FROM memberships
      WHERE workspace_id = ${claims.workspaceId} AND user_id = ${claims.userId}
    `;
    if (rows.length === 0) {
      throw new UnauthorizedError("not a member of this workspace");
    }
  }

  async member(claims: AuthClaims): Promise<Membership | null> {
    return this.withUser(claims, async (tx) => {
      const rows = await tx`
        SELECT workspace_id, user_id, role FROM memberships
        WHERE workspace_id = ${claims.workspaceId} AND user_id = ${claims.userId}
      `;
      const row = rows[0];
      if (!row) {
        return null;
      }
      return {
        userId: String(row["user_id"]),
        workspaceId: String(row["workspace_id"]),
        role: String(row["role"]),
      };
    });
  }

  async people(claims: AuthClaims): Promise<PersonRef[]> {
    return this.withUser(claims, async (tx) => {
      const rows = await tx`
        SELECT p.id, p.name FROM profiles p
        JOIN memberships m ON m.user_id = p.id::text
        WHERE m.workspace_id = ${claims.workspaceId}
        ORDER BY p.name
      `;
      return rows.map((row) => ({ id: String(row["id"]), name: String(row["name"]) }));
    });
  }

  async account(claims: AuthClaims, id: string): Promise<Account | null> {
    return this.withUser(claims, async (tx) => {
      const rows = await tx`
        SELECT * FROM accounts WHERE workspace_id = ${claims.workspaceId} AND id = ${id}
      `;
      return rows[0] ? mapAccount(rows[0]) : null;
    });
  }

  async accounts(claims: AuthClaims): Promise<Account[]> {
    return this.withUser(claims, async (tx) => {
      const rows = await tx`
        SELECT * FROM accounts WHERE workspace_id = ${claims.workspaceId} ORDER BY name
      `;
      return rows.map(mapAccount);
    });
  }

  async contacts(claims: AuthClaims, accountId: string): Promise<Contact[]> {
    return this.withUser(claims, async (tx) => {
      const rows = await tx`
        SELECT * FROM contacts
        WHERE workspace_id = ${claims.workspaceId} AND account_id = ${accountId}
        ORDER BY name
      `;
      return rows.map(mapContact);
    });
  }

  async project(claims: AuthClaims, id: string): Promise<Project | null> {
    return this.withUser(claims, async (tx) => {
      const rows = await tx`
        SELECT * FROM projects WHERE workspace_id = ${claims.workspaceId} AND id = ${id}
      `;
      return rows[0] ? mapProject(rows[0]) : null;
    });
  }

  async projects(claims: AuthClaims): Promise<Project[]> {
    return this.withUser(claims, async (tx) => {
      const rows = await tx`
        SELECT * FROM projects WHERE workspace_id = ${claims.workspaceId} ORDER BY name
      `;
      return rows.map(mapProject);
    });
  }

  async milestone(claims: AuthClaims, id: string): Promise<Milestone | null> {
    return this.withUser(claims, async (tx) => {
      const rows = await tx`
        SELECT * FROM milestones WHERE workspace_id = ${claims.workspaceId} AND id = ${id}
      `;
      return rows[0] ? mapMilestone(rows[0]) : null;
    });
  }

  async milestones(claims: AuthClaims, projectId: string): Promise<Milestone[]> {
    return this.withUser(claims, async (tx) => {
      const rows = await tx`
        SELECT * FROM milestones
        WHERE workspace_id = ${claims.workspaceId} AND project_id = ${projectId}
        ORDER BY name
      `;
      return rows.map(mapMilestone);
    });
  }

  async task(claims: AuthClaims, id: string): Promise<Task | null> {
    return this.withUser(claims, async (tx) => {
      const rows = await tx`
        SELECT * FROM tasks WHERE workspace_id = ${claims.workspaceId} AND id = ${id}
      `;
      return rows[0] ? mapTask(rows[0]) : null;
    });
  }

  async tasks(claims: AuthClaims, filter: TaskFilter = {}): Promise<Task[]> {
    return this.withUser(claims, async (tx) => {
      const rows = await tx`
        SELECT * FROM tasks
        WHERE workspace_id = ${claims.workspaceId}
          AND (${filter.projectId === undefined} OR project_id = ${filter.projectId ?? null})
          AND (${filter.accountId === undefined} OR account_id = ${filter.accountId ?? null})
          AND (${filter.ownerId === undefined} OR owner_id = ${filter.ownerId ?? null})
        ORDER BY title
      `;
      return rows.map(mapTask);
    });
  }

  async commitment(claims: AuthClaims, id: string): Promise<Commitment | null> {
    return this.withUser(claims, async (tx) => {
      const rows = await tx`
        SELECT * FROM commitments WHERE workspace_id = ${claims.workspaceId} AND id = ${id}
      `;
      return rows[0] ? mapCommitment(rows[0]) : null;
    });
  }

  async commitments(claims: AuthClaims, accountId: string): Promise<Commitment[]> {
    return this.withUser(claims, async (tx) => {
      const rows = await tx`
        SELECT * FROM commitments
        WHERE workspace_id = ${claims.workspaceId} AND account_id = ${accountId}
        ORDER BY text
      `;
      return rows.map(mapCommitment);
    });
  }

  async createMeeting(claims: AuthClaims, input: MeetingInput): Promise<MeetingType> {
    return this.withService(async (tx) => {
      await this.requireMember(tx, claims);
      const rows = await tx`
        INSERT INTO meetings (id, workspace_id, zone_id, started_at, transcript, summary, decisions)
        VALUES (${randomUUID()}, ${claims.workspaceId}, ${input.zoneId}, ${Date.now()},
          ${input.transcript}, ${input.summary}, ${asJson(tx, input.decisions)})
        RETURNING *
      `;
      return mapMeeting(rows[0]);
    });
  }

  async meeting(claims: AuthClaims, id: string): Promise<MeetingType | null> {
    return this.withUser(claims, async (tx) => {
      const rows = await tx`
        SELECT * FROM meetings WHERE workspace_id = ${claims.workspaceId} AND id = ${id}
      `;
      return rows[0] ? mapMeeting(rows[0]) : null;
    });
  }

  async meetings(claims: AuthClaims): Promise<MeetingType[]> {
    return this.withUser(claims, async (tx) => {
      const rows = await tx`
        SELECT * FROM meetings WHERE workspace_id = ${claims.workspaceId} ORDER BY started_at
      `;
      return rows.map(mapMeeting);
    });
  }

  async saveChanges(claims: AuthClaims, changes: ProposedChange[]): Promise<void> {
    if (changes.length === 0) {
      return;
    }
    await this.withService(async (tx) => {
      await this.requireMember(tx, claims);
      for (const change of changes) {
        await tx`
          INSERT INTO proposed_changes
            (id, workspace_id, meeting_id, type, target_table, target_id,
             before, after, status, needs_review)
          VALUES (${change.id}, ${claims.workspaceId}, ${change.sourceMeetingId}, ${change.type},
            ${tableFor(change.type)}, ${change.targetId},
            ${change.before === null ? null : asJson(tx, change.before)},
            ${asJson(tx, change.after)}, ${change.status}, ${change.needsReview})
          ON CONFLICT (id) DO UPDATE SET
            workspace_id = EXCLUDED.workspace_id,
            meeting_id = EXCLUDED.meeting_id,
            type = EXCLUDED.type,
            target_table = EXCLUDED.target_table,
            target_id = EXCLUDED.target_id,
            before = EXCLUDED.before,
            after = EXCLUDED.after,
            status = EXCLUDED.status,
            needs_review = EXCLUDED.needs_review
        `;
      }
    });
  }

  async change(claims: AuthClaims, id: string): Promise<ProposedChange | null> {
    return this.withUser(claims, async (tx) => {
      const rows = await tx`
        SELECT * FROM proposed_changes WHERE workspace_id = ${claims.workspaceId} AND id = ${id}
      `;
      return rows[0] ? mapChange(rows[0]) : null;
    });
  }

  async changes(claims: AuthClaims, query: ProposedChangeQuery = {}): Promise<ProposedChange[]> {
    return this.withUser(claims, async (tx) => {
      const rows = await tx`
        SELECT * FROM proposed_changes
        WHERE workspace_id = ${claims.workspaceId}
          AND (${query.status === undefined} OR status = ${query.status ?? null})
          AND (${query.meetingId === undefined} OR meeting_id = ${query.meetingId ?? null})
        ORDER BY id
      `;
      return rows.map(mapChange);
    });
  }

  async approveChange(claims: AuthClaims, id: string): Promise<void> {
    await this.withService(async (tx) => {
      await this.requireMember(tx, claims);
      const rows = await tx`
        SELECT * FROM proposed_changes
        WHERE workspace_id = ${claims.workspaceId} AND id = ${id}
        FOR UPDATE
      `;
      const row = rows[0];
      if (!row) {
        throw new NotFoundError(`unknown change ${id}`);
      }
      const change = mapChange(row);
      if (change.status !== "pending") {
        throw new NotPendingError(id);
      }
      const rowId = await this.applyChange(tx, claims.workspaceId, change);
      await tx`
        INSERT INTO audit_log
          (id, workspace_id, actor_id, action, table_name, row_id, before, after, ts)
        VALUES (${randomUUID()}, ${claims.workspaceId}, ${claims.userId}, 'approve',
          ${tableFor(change.type)}, ${rowId},
          ${change.before === null ? null : asJson(tx, change.before)},
          ${asJson(tx, change.after)}, ${Date.now()})
      `;
      await tx`
        UPDATE proposed_changes SET status = 'approved', decided_by = ${claims.userId},
          decided_at = now()
        WHERE id = ${id} AND workspace_id = ${claims.workspaceId}
      `;
    });
  }

  async rejectChange(claims: AuthClaims, id: string): Promise<void> {
    await this.withService(async (tx) => {
      await this.requireMember(tx, claims);
      const rows = await tx`
        SELECT * FROM proposed_changes
        WHERE workspace_id = ${claims.workspaceId} AND id = ${id}
        FOR UPDATE
      `;
      const row = rows[0];
      if (!row) {
        throw new NotFoundError(`unknown change ${id}`);
      }
      const change = mapChange(row);
      if (change.status !== "pending") {
        throw new NotPendingError(id);
      }
      await tx`
        INSERT INTO audit_log
          (id, workspace_id, actor_id, action, table_name, row_id, before, after, ts)
        VALUES (${randomUUID()}, ${claims.workspaceId}, ${claims.userId}, 'reject',
          ${tableFor(change.type)}, ${change.targetId ?? ""},
          ${change.before === null ? null : asJson(tx, change.before)},
          ${asJson(tx, change.after)}, ${Date.now()})
      `;
      await tx`
        UPDATE proposed_changes SET status = 'rejected', decided_by = ${claims.userId},
          decided_at = now()
        WHERE id = ${id} AND workspace_id = ${claims.workspaceId}
      `;
    });
  }

  async audit(claims: AuthClaims): Promise<AuditRow[]> {
    return this.withUser(claims, async (tx) => {
      const rows = await tx`
        SELECT * FROM audit_log WHERE workspace_id = ${claims.workspaceId} ORDER BY ts
      `;
      return rows.map(mapAudit);
    });
  }

  async saveChat(
    claims: AuthClaims,
    input: { name: string; text: string },
  ): Promise<ChatMessage> {
    return this.withService(async (tx) => {
      await this.requireMember(tx, claims);
      const rows = await tx`
        INSERT INTO chat_messages (id, workspace_id, user_id, name, text, ts)
        VALUES (${randomUUID()}, ${claims.workspaceId}, ${claims.userId},
          ${input.name}, ${input.text}, ${Date.now()})
        RETURNING *
      `;
      return mapChat(rows[0]);
    });
  }

  async chat(claims: AuthClaims, limit = 50): Promise<ChatMessage[]> {
    return this.withUser(claims, async (tx) => {
      const rows = await tx`
        SELECT * FROM (
          SELECT * FROM chat_messages
          WHERE workspace_id = ${claims.workspaceId}
          ORDER BY ts DESC LIMIT ${limit}
        ) recent ORDER BY ts
      `;
      return rows.map(mapChat);
    });
  }

  /** Applies one pending change to the records; answers the id of the row it touched. */
  private async applyChange(tx: Tx, workspaceId: string, change: ProposedChange): Promise<string> {
    const after = change.after as Record<string, unknown>;
    switch (change.type) {
      case "milestone_date": {
        if (!change.targetId) {
          throw new NotFoundError(`change ${change.id} matches no milestone`);
        }
        const targetDate = reqStr(change.id, after["targetDate"]);
        const rows = await tx`
          UPDATE milestones SET target_date = ${targetDate},
            source_meeting_id = ${change.sourceMeetingId}
          WHERE id = ${change.targetId} AND workspace_id = ${workspaceId}
          RETURNING id
        `;
        if (!rows[0]) {
          throw new NotFoundError(`change ${change.id} matches no milestone`);
        }
        return String(rows[0]["id"]);
      }
      case "commitment_update": {
        if (!change.targetId) {
          throw new NotFoundError(`change ${change.id} matches no commitment`);
        }
        const updates: Record<string, unknown> = {
          source_meeting_id: change.sourceMeetingId,
        };
        if (after["text"] !== undefined) {
          updates["text"] = reqStr(change.id, after["text"]);
        }
        if (after["dueDate"] !== undefined) {
          updates["due_date"] = optStr(after["dueDate"]);
        }
        const rows = await tx`
          UPDATE commitments SET ${tx(updates)}
          WHERE id = ${change.targetId} AND workspace_id = ${workspaceId}
          RETURNING id
        `;
        if (!rows[0]) {
          throw new NotFoundError(`change ${change.id} matches no commitment`);
        }
        return String(rows[0]["id"]);
      }
      case "commitment_create": {
        const id = randomUUID();
        await tx`
          INSERT INTO commitments
            (id, workspace_id, account_id, text, due_date,
             linked_task_id, linked_milestone_id, source_meeting_id)
          VALUES (${id}, ${workspaceId},
            ${reqStr(change.id, after["accountId"])}, ${reqStr(change.id, after["text"])},
            ${optStr(after["dueDate"])}, ${optStr(after["linkedTaskId"])},
            ${optStr(after["linkedMilestoneId"])}, ${change.sourceMeetingId})
        `;
        return id;
      }
      case "task_create": {
        const id = randomUUID();
        await tx`
          INSERT INTO tasks
            (id, workspace_id, project_id, account_id, title, owner_id, due_date,
             status, blocked_reason, source_meeting_id)
          VALUES (${id}, ${workspaceId},
            ${optStr(after["projectId"])}, ${optStr(after["accountId"])},
            ${reqStr(change.id, after["title"])}, ${optStr(after["ownerId"])},
            ${optStr(after["dueDate"])},
            ${(after["status"] as Task["status"] | undefined) ?? "todo"},
            ${optStr(after["blockedReason"])}, ${change.sourceMeetingId})
        `;
        return id;
      }
      case "task_update": {
        if (!change.targetId) {
          throw new NotFoundError(`change ${change.id} matches no task`);
        }
        const updates: Record<string, unknown> = {
          source_meeting_id: change.sourceMeetingId,
        };
        if (after["title"] !== undefined) {
          updates["title"] = reqStr(change.id, after["title"]);
        }
        if (after["ownerId"] !== undefined) {
          updates["owner_id"] = optStr(after["ownerId"]);
        }
        if (after["dueDate"] !== undefined) {
          updates["due_date"] = optStr(after["dueDate"]);
        }
        if (after["status"] !== undefined) {
          updates["status"] = after["status"];
        }
        if (after["blockedReason"] !== undefined) {
          updates["blocked_reason"] = optStr(after["blockedReason"]);
        }
        const rows = await tx`
          UPDATE tasks SET ${tx(updates)}
          WHERE id = ${change.targetId} AND workspace_id = ${workspaceId}
          RETURNING id
        `;
        if (!rows[0]) {
          throw new NotFoundError(`change ${change.id} matches no task`);
        }
        return String(rows[0]["id"]);
      }
      case "task_reassign": {
        if (!change.targetId) {
          throw new NotFoundError(`change ${change.id} matches no task`);
        }
        const ownerId = reqStr(change.id, after["ownerId"]);
        const rows = await tx`
          UPDATE tasks SET owner_id = ${ownerId},
            source_meeting_id = ${change.sourceMeetingId}
          WHERE id = ${change.targetId} AND workspace_id = ${workspaceId}
          RETURNING id
        `;
        if (!rows[0]) {
          throw new NotFoundError(`change ${change.id} matches no task`);
        }
        return String(rows[0]["id"]);
      }
    }
  }
}

export function createPostgresRepo(
  databaseUrl: string,
  options: PostgresRepoOptions = {},
): PostgresRepo {
  const prepare = options.prepare ?? !isPoolerUrl(databaseUrl);
  return new PostgresRepo(postgres(databaseUrl, { prepare }));
}
