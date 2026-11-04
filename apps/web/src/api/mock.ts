import {
  zoneDisplayName,
  DEMO_ACCOUNT,
  DEMO_COMMITMENT,
  DEMO_CONTACT,
  DEMO_MILESTONE,
  DEMO_PEOPLE,
  DEMO_PROJECT,
  DEMO_TASKS,
  FIXTURE_TRANSCRIPTS,
  MeetingCreate,
  acmeSyncExpected,
  type AccountStatus,
  type AskResult,
  type Commitment,
  type DayItem,
  type Meeting,
  type MeetingProcessResult,
  type Milestone,
  type MyDay,
  type PersonRef,
  type ProjectStatus,
  type ProposedChange,
  type Task,
} from "@office/shared";
import type { OfficeApi } from "./types.js";
import { MockBookingsApi, bookingsApi } from "./bookings.js";

function people(): PersonRef[] {
  return DEMO_PEOPLE.map((p) => ({ id: p.key, name: p.name }));
}

function personName(id: string | null): string {
  return DEMO_PEOPLE.find((p) => p.key === id)?.name ?? id ?? "Unassigned";
}

/**
 * The in-memory `OfficeApi` over the shared demo data: the default in development and in
 * tests (`index.ts`). Approve and reject change the mock records; ask answers the demo
 * status question from the current records and abstains otherwise.
 */
export class MockOfficeApi implements OfficeApi {
  private milestone: Milestone = structuredClone(DEMO_MILESTONE);
  private tasks: Task[] = structuredClone(DEMO_TASKS);
  private commitments: Commitment[] = [structuredClone(DEMO_COMMITMENT)];
  private readonly meetings: Meeting[] = [];
  private readonly changes: ProposedChange[] = [];

  private get commitment(): Commitment {
    const found = this.commitments.find((c) => c.id === DEMO_COMMITMENT.id);
    if (!found) {
      throw new Error("the demo commitment is missing");
    }
    return found;
  }

  async myDay(): Promise<MyDay> {
    const items: DayItem[] = [];
    for (const task of this.tasks) {
      if (task.status === "done") {
        continue;
      }
      const blocked = task.status === "blocked" && task.blockedReason ? `, blocked: ${task.blockedReason}` : "";
      items.push({
        id: task.id,
        kind: "task",
        title: task.title,
        reason: `Owned by ${personName(task.ownerId)}, due ${task.dueDate ?? "no date"}${blocked}`,
        dueDate: task.dueDate,
      });
    }
    if (this.commitment.dueDate) {
      items.push({
        id: this.commitment.id,
        kind: "followup",
        title: this.commitment.text,
        reason: `Committed to ${DEMO_ACCOUNT.name}, due ${this.commitment.dueDate}`,
        dueDate: this.commitment.dueDate,
      });
    }
    for (const meeting of this.meetings) {
      items.push({
        id: meeting.id,
        kind: "meeting",
        title: `Meeting in ${zoneDisplayName(meeting.zoneId)}`,
        reason: meeting.summary,
        dueDate: null,
      });
    }
    return { items };
  }

  async projectStatus(id: string): Promise<ProjectStatus> {
    if (id !== DEMO_PROJECT.id) {
      throw new Error(`unknown project ${id}`);
    }
    return {
      project: structuredClone(DEMO_PROJECT),
      milestones: [structuredClone(this.milestone)],
      tasks: structuredClone(this.tasks),
      decisions: this.meetings.flatMap((m) =>
        m.decisions.map((d) => ({ text: d.text, meetingId: m.id })),
      ),
      people: people(),
    };
  }

  async accountStatus(id: string): Promise<AccountStatus> {
    if (id !== DEMO_ACCOUNT.id) {
      throw new Error(`unknown account ${id}`);
    }
    const projectIds = new Set([DEMO_PROJECT.id]);
    return {
      account: structuredClone(DEMO_ACCOUNT),
      contacts: [structuredClone(DEMO_CONTACT)],
      commitments: structuredClone(this.commitments),
      openTasks: structuredClone(
        this.tasks.filter((t) => t.status !== "done" && t.projectId !== null && projectIds.has(t.projectId)),
      ),
      recentMeetings: this.meetings.map((m) => ({
        id: m.id,
        zoneId: m.zoneId,
        startedAt: m.startedAt,
        summary: m.summary,
      })),
      people: people(),
    };
  }

  async listPending(meetingId?: string): Promise<ProposedChange[]> {
    return structuredClone(
      this.changes.filter(
        (c) => c.status === "pending" && (meetingId === undefined || c.sourceMeetingId === meetingId),
      ),
    );
  }

  async processMeeting(input: MeetingCreate): Promise<MeetingProcessResult> {
    const created = MeetingCreate.parse(input);
    const meeting: Meeting = {
      id: crypto.randomUUID(),
      zoneId: created.zoneId,
      startedAt: Date.now(),
      transcript: "fixture" in created ? FIXTURE_TRANSCRIPTS[created.fixture] : created.transcript,
      summary: "",
      decisions: [],
    };
    // P6-B offline parity: a booked meeting stores the mock booking's agenda.
    if (created.bookingId && bookingsApi instanceof MockBookingsApi) {
      const booking = (await bookingsApi.listOpen()).find((item) => item.id === created.bookingId);
      if (booking?.agenda) {
        meeting.agenda = booking.agenda;
      }
    }
    let proposedChanges: ProposedChange[] = [];
    if ("fixture" in created) {
      meeting.summary = "Acme sync: go-live moves to 22 Nov, the webhook fix moves to Arjun, Maya notifies Acme.";
      meeting.decisions = [
        { text: "Move go-live to 22 November" },
        { text: "Reassign the webhook fix to Arjun" },
        { text: "Maya notifies Acme of the new date" },
      ];
      proposedChanges = acmeSyncExpected(meeting.id);
      this.changes.push(...structuredClone(proposedChanges));
    } else {
      meeting.summary = created.transcript.split("\n")[0].slice(0, 200);
    }
    this.meetings.push(structuredClone(meeting));
    return { meetingId: meeting.id, proposedChanges: structuredClone(proposedChanges) };
  }

  async approve(id: string): Promise<void> {
    const change = this.pendingChange(id);
    this.applyChange(change);
    change.status = "approved";
  }

  async reject(id: string): Promise<void> {
    this.pendingChange(id).status = "rejected";
  }

  async ask(question: string): Promise<AskResult> {
    const q = question.toLowerCase();
    const isStatus = q.includes("acme") && (
      q.includes("status") ||
      q.includes("integration") ||
      q.includes("go-live") ||
      q.includes("go live") ||
      q.includes("golive")
    );
    if (!isStatus) {
      return { answer: "I don't have a record of that.", abstained: true, sources: [] };
    }
    const webhook = this.tasks.find((t) => t.title === "Fix webhook signature validation");
    const answer =
      `The ${DEMO_PROJECT.name} go-live is ${this.milestone.targetDate} (${this.milestone.status}). ` +
      `Commitment: ${this.commitment.text}.` +
      (webhook ? ` "${webhook.title}" is ${webhook.status}, owned by ${personName(webhook.ownerId)}.` : "");
    return {
      answer,
      abstained: false,
      sources: [
        { type: "milestone", id: this.milestone.id, label: this.milestone.name },
        { type: "commitment", id: this.commitment.id, label: this.commitment.text },
        ...(webhook ? [{ type: "task" as const, id: webhook.id, label: webhook.title }] : []),
      ],
    };
  }

  async meeting(id: string): Promise<Meeting> {
    const meeting = this.meetings.find((m) => m.id === id);
    if (!meeting) {
      throw new Error(`unknown meeting ${id}`);
    }
    return structuredClone(meeting);
  }

  private pendingChange(id: string): ProposedChange {
    const change = this.changes.find((c) => c.id === id);
    if (!change) {
      throw new Error(`unknown change ${id}`);
    }
    if (change.status !== "pending") {
      throw new Error(`change ${id} is no longer pending`);
    }
    return change;
  }

  private applyChange(change: ProposedChange): void {
    const after = change.after as Record<string, unknown>;
    switch (change.type) {
      case "milestone_date":
        if (change.targetId === this.milestone.id) {
          this.milestone.targetDate = after["targetDate"] as string;
          this.milestone.sourceMeetingId = change.sourceMeetingId;
        }
        break;
      case "commitment_update":
        if (change.targetId === this.commitment.id) {
          if (after["text"] !== undefined) {
            this.commitment.text = after["text"] as string;
          }
          if (after["dueDate"] !== undefined) {
            this.commitment.dueDate = after["dueDate"] as string | null;
          }
          this.commitment.sourceMeetingId = change.sourceMeetingId;
        }
        break;
      case "commitment_create":
        this.commitments.push({
          id: crypto.randomUUID(),
          accountId: after["accountId"] as string,
          text: after["text"] as string,
          dueDate: (after["dueDate"] as string | null | undefined) ?? null,
          linkedTaskId: (after["linkedTaskId"] as string | null | undefined) ?? null,
          linkedMilestoneId: (after["linkedMilestoneId"] as string | null | undefined) ?? null,
          sourceMeetingId: change.sourceMeetingId,
        });
        break;
      case "task_create":
        this.tasks.push({
          id: crypto.randomUUID(),
          projectId: (after["projectId"] as string | null | undefined) ?? null,
          accountId: (after["accountId"] as string | null | undefined) ?? null,
          title: after["title"] as string,
          ownerId: (after["ownerId"] as string | null | undefined) ?? null,
          dueDate: (after["dueDate"] as string | null | undefined) ?? null,
          status: (after["status"] as Task["status"] | undefined) ?? "todo",
          blockedReason: null,
          sourceMeetingId: change.sourceMeetingId,
        });
        break;
      case "task_update": {
        const task = this.tasks.find((t) => t.id === change.targetId);
        if (task) {
          if (after["title"] !== undefined) {
            task.title = after["title"] as string;
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
          task.sourceMeetingId = change.sourceMeetingId;
        }
        break;
      }
      case "task_reassign": {
        const task = this.tasks.find((t) => t.id === change.targetId);
        if (task) {
          task.ownerId = after["ownerId"] as string;
          task.sourceMeetingId = change.sourceMeetingId;
        }
        break;
      }
    }
  }
}

export function createMockApi(): OfficeApi {
  return new MockOfficeApi();
}
