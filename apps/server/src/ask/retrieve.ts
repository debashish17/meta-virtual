import type {
  Account,
  AskSourceType,
  AuthClaims,
  Commitment,
  Meeting,
  Milestone,
  Project,
  Task,
} from "@office/shared";
import { zoneDisplayName } from "@office/shared";
import type { Repo } from "../db/repo.js";
import type { ClassifiedQuestion } from "./classify.js";

/** One retrieved record: what the LLM may cite, and the label the answer resolves. */
export interface RetrievedRecord {
  type: AskSourceType;
  id: string;
  label: string;
  record: Account | Project | Milestone | Task | Commitment | Meeting;
}

function label(text: string, fallback: string): string {
  const trimmed = text.trim().slice(0, 80);
  return trimmed.length > 0 ? trimmed : fallback;
}

async function myDayRecords(repo: Repo, claims: AuthClaims, userId: string): Promise<RetrievedRecord[]> {
  const [tasks, accounts, meetings] = await Promise.all([
    repo.tasks(claims, { ownerId: userId }),
    repo.accounts(claims),
    repo.meetings(claims),
  ]);
  const found: RetrievedRecord[] = [];
  for (const task of tasks) {
    if (task.status === "done") {
      continue;
    }
    found.push({ type: "task", id: task.id, label: label(task.title, task.id), record: task });
  }
  for (const account of accounts) {
    for (const commitment of await repo.commitments(claims, account.id)) {
      if (!commitment.dueDate) {
        continue;
      }
      found.push({
        type: "commitment",
        id: commitment.id,
        label: label(commitment.text, commitment.id),
        record: commitment,
      });
    }
  }
  for (const meeting of meetings) {
    found.push({
      type: "meeting",
      id: meeting.id,
      label: label(meeting.summary, `Meeting in ${zoneDisplayName(meeting.zoneId)}`),
      record: meeting,
    });
  }
  return found;
}

async function projectRecords(
  repo: Repo,
  claims: AuthClaims,
  projectId: string,
): Promise<RetrievedRecord[]> {
  const project = await repo.project(claims, projectId);
  if (!project) {
    return [];
  }
  const [milestones, tasks, meetings] = await Promise.all([
    repo.milestones(claims, projectId),
    repo.tasks(claims, { projectId }),
    repo.meetings(claims),
  ]);
  const found: RetrievedRecord[] = [
    { type: "project", id: project.id, label: label(project.name, project.id), record: project },
  ];
  for (const milestone of milestones) {
    found.push({
      type: "milestone",
      id: milestone.id,
      label: label(milestone.name, milestone.id),
      record: milestone,
    });
  }
  for (const commitment of await repo.commitments(claims, project.accountId)) {
    found.push({
      type: "commitment",
      id: commitment.id,
      label: label(commitment.text, commitment.id),
      record: commitment,
    });
  }
  for (const task of tasks) {
    found.push({ type: "task", id: task.id, label: label(task.title, task.id), record: task });
  }
  for (const meeting of meetings) {
    found.push({
      type: "meeting",
      id: meeting.id,
      label: label(meeting.summary, `Meeting in ${zoneDisplayName(meeting.zoneId)}`),
      record: meeting,
    });
  }
  return found;
}

async function accountRecords(
  repo: Repo,
  claims: AuthClaims,
  accountId: string,
): Promise<RetrievedRecord[]> {
  const account = await repo.account(claims, accountId);
  if (!account) {
    return [];
  }
  const [projects, commitments, tasks, meetings] = await Promise.all([
    repo.projects(claims),
    repo.commitments(claims, accountId),
    repo.tasks(claims),
    repo.meetings(claims),
  ]);
  const owned = new Set(projects.filter((p) => p.accountId === accountId).map((p) => p.id));
  const found: RetrievedRecord[] = [
    { type: "account", id: account.id, label: label(account.name, account.id), record: account },
  ];
  for (const project of projects) {
    if (owned.has(project.id)) {
      found.push({
        type: "project",
        id: project.id,
        label: label(project.name, project.id),
        record: project,
      });
    }
  }
  for (const commitment of commitments) {
    found.push({
      type: "commitment",
      id: commitment.id,
      label: label(commitment.text, commitment.id),
      record: commitment,
    });
  }
  for (const task of tasks) {
    if (task.status !== "done" && (task.accountId === accountId || (task.projectId !== null && owned.has(task.projectId)))) {
      found.push({ type: "task", id: task.id, label: label(task.title, task.id), record: task });
    }
  }
  for (const meeting of meetings) {
    found.push({
      type: "meeting",
      id: meeting.id,
      label: label(meeting.summary, `Meeting in ${zoneDisplayName(meeting.zoneId)}`),
      record: meeting,
    });
  }
  return found;
}

async function decisionRecords(repo: Repo, claims: AuthClaims): Promise<RetrievedRecord[]> {
  const meetings = await repo.meetings(claims);
  return meetings
    .filter((meeting) => meeting.decisions.length > 0)
    .map((meeting) => ({
      type: "meeting" as const,
      id: meeting.id,
      label: label(meeting.summary, `Meeting in ${zoneDisplayName(meeting.zoneId)}`),
      record: meeting,
    }));
}

/**
 * Retrieves the records a classified question may cite (reads only). Contacts are
 * left out: no source type can cite them. An empty set means the pipeline abstains.
 */
export async function retrieveForAsk(
  repo: Repo,
  claims: AuthClaims,
  userId: string,
  classified: ClassifiedQuestion,
): Promise<RetrievedRecord[]> {
  switch (classified.class) {
    case "my_day":
      return myDayRecords(repo, claims, userId);
    case "project_status":
      return classified.projectId ? projectRecords(repo, claims, classified.projectId) : [];
    case "account_status":
      return classified.accountId ? accountRecords(repo, claims, classified.accountId) : [];
    case "decision_history":
      return decisionRecords(repo, claims);
    case "other":
      return [];
  }
}
