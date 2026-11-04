import { MyDay, zoneDisplayName, type AuthClaims, type Commitment, type DayItem, type Meeting, type MyDay as MyDayType, type Task } from "@office/shared";
import type { Repo } from "../db/repo.js";

/** Everything `buildMyDay` shapes; `myDay` reads it from the `Repo`. */
export interface MyDayInput {
  userId: string;
  tasks: Task[];
  commitments: { commitment: Commitment; accountName: string }[];
  meetings: Meeting[];
}

/**
 * Builds "my day" (pure): the user's open tasks, the customer follow-ups and the
 * recent meetings, each with the reason it is on the list.
 */
export function buildMyDay(input: MyDayInput): MyDayType {
  const items: DayItem[] = [];
  for (const task of input.tasks) {
    if (task.ownerId !== input.userId || task.status === "done") {
      continue;
    }
    const blocked =
      task.status === "blocked" && task.blockedReason ? `, blocked: ${task.blockedReason}` : "";
    items.push({
      id: task.id,
      kind: "task",
      title: task.title,
      reason: `Your task, due ${task.dueDate ?? "no date"}${blocked}`,
      dueDate: task.dueDate,
    });
  }
  for (const { commitment, accountName } of input.commitments) {
    if (!commitment.dueDate) {
      continue;
    }
    items.push({
      id: commitment.id,
      kind: "followup",
      title: commitment.text,
      reason: `Committed to ${accountName}, due ${commitment.dueDate}`,
      dueDate: commitment.dueDate,
    });
  }
  for (const meeting of input.meetings) {
    items.push({
      id: meeting.id,
      kind: "meeting",
      title: `Meeting in ${zoneDisplayName(meeting.zoneId)}`,
      reason: meeting.summary,
      dueDate: null,
    });
  }
  return MyDay.parse({ items });
}

/** Reads the user's day from the `Repo` (reads only) and builds it. */
export async function myDay(repo: Repo, claims: AuthClaims, userId: string): Promise<MyDayType> {
  const [tasks, accounts, meetings] = await Promise.all([
    repo.tasks(claims, { ownerId: userId }),
    repo.accounts(claims),
    repo.meetings(claims),
  ]);
  const commitments: MyDayInput["commitments"] = [];
  for (const account of accounts) {
    for (const commitment of await repo.commitments(claims, account.id)) {
      commitments.push({ commitment, accountName: account.name });
    }
  }
  return buildMyDay({ userId, tasks, commitments, meetings });
}
