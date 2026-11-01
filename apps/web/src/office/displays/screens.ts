import {
  AccountStatus,
  ProjectStatus,
  type Milestone,
  type PersonRef,
  type Task,
} from "@office/shared";

/**
 * What the wall displays show: the Acme room's deal stage, commitment and next milestone,
 * and the project room's milestones, blocked tasks and owners. Parsed with the shared Zod
 * schemas, so bad api data fails here instead of drawing half a screen. The same `ScreenData`
 * feeds the canvas texture and the click-to-open DOM overlay.
 */

export interface ScreenSection {
  heading: string;
  lines: string[];
}

export interface ScreenData {
  id: "acme" | "project";
  title: string;
  /** A glanceable status: the project screen warns while anything is blocked. */
  tone: "ok" | "warn";
  sections: ScreenSection[];
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** `2026-11-15` -> `15 Nov`; anything else passes through so the screen never blanks a date. */
export function shortDate(iso: string | null): string {
  if (iso === null) return "no date";
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return iso;
  const month = MONTHS[Number(match[2]) - 1];
  if (!month) return iso;
  return `${Number(match[3])} ${month}`;
}

function ownerName(people: PersonRef[], ownerId: string | null): string {
  if (ownerId === null) return "Unassigned";
  return people.find((p) => p.id === ownerId)?.name ?? ownerId;
}

function nextMilestone(milestones: Milestone[]): Milestone | null {
  const upcoming = milestones.filter((m) => m.status !== "done");
  upcoming.sort((a, b) => (a.targetDate < b.targetDate ? -1 : a.targetDate > b.targetDate ? 1 : 0));
  return upcoming[0] ?? null;
}

export function buildAcmeScreen(accountData: unknown, projectData: unknown): ScreenData {
  const account = AccountStatus.parse(accountData);
  const project = ProjectStatus.parse(projectData);
  const next = nextMilestone(project.milestones);
  return {
    id: "acme",
    title: account.account.name,
    tone: "ok",
    sections: [
      { heading: "Deal stage", lines: [account.account.dealStage] },
      {
        heading: "Commitment",
        lines:
          account.commitments.length === 0
            ? ["No open commitments"]
            : account.commitments.map((c) => `${c.text} — due ${shortDate(c.dueDate)}`),
      },
      {
        heading: "Next milestone",
        lines: next ? [`${next.name} · ${shortDate(next.targetDate)}`] : ["No upcoming milestones"],
      },
    ],
  };
}

function blockedLine(task: Task, people: PersonRef[]): string {
  const reason = task.blockedReason ?? "no reason given";
  return `${task.title} — ${reason} (${ownerName(people, task.ownerId)})`;
}

function ownerLines(tasks: Task[], people: PersonRef[]): string[] {
  const open = tasks.filter((t) => t.status !== "done");
  if (open.length === 0) return ["No open tasks"];
  const counts = new Map<string, number>();
  for (const task of open) {
    const name = ownerName(people, task.ownerId);
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([name, n]) => `${name} · ${n} open task${n === 1 ? "" : "s"}`);
}

export function buildProjectScreen(projectData: unknown): ScreenData {
  const project = ProjectStatus.parse(projectData);
  const blocked = project.tasks.filter((t) => t.status === "blocked");
  return {
    id: "project",
    title: project.project.name,
    tone: blocked.length === 0 ? "ok" : "warn",
    sections: [
      {
        heading: "Milestones",
        lines:
          project.milestones.length === 0
            ? ["No milestones"]
            : project.milestones.map((m) => `${m.name} · ${shortDate(m.targetDate)} (${m.status})`),
      },
      {
        heading: "Blocked",
        lines: blocked.length === 0 ? ["Nothing blocked"] : blocked.map((t) => blockedLine(t, project.people)),
      },
      { heading: "Owners", lines: ownerLines(project.tasks, project.people) },
    ],
  };
}

/** Redraw the canvas only when this changes: the data's lines in a stable order. */
export function screenHash(data: ScreenData): string {
  return JSON.stringify(data);
}
