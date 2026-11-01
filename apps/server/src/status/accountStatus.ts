import { AccountStatus, type Account, type AccountStatus as AccountStatusType, type AuthClaims, type Commitment, type Contact, type Meeting, type PersonRef, type Project, type Task } from "@office/shared";
import { NotFoundError, type Repo } from "../db/repo.js";

/** Everything `buildAccountStatus` shapes; `accountStatus` reads it from the `Repo`. */
export interface AccountStatusInput {
  account: Account;
  contacts: Contact[];
  commitments: Commitment[];
  tasks: Task[];
  projects: Project[];
  meetings: Meeting[];
  people: PersonRef[];
}

/** Builds the account status (pure): contacts, commitments, open tasks, recent meetings. */
export function buildAccountStatus(input: AccountStatusInput): AccountStatusType {
  const projectIds = new Set(
    input.projects.filter((p) => p.accountId === input.account.id).map((p) => p.id),
  );
  const openTasks = input.tasks.filter(
    (task) =>
      task.status !== "done" &&
      (task.accountId === input.account.id ||
        (task.projectId !== null && projectIds.has(task.projectId))),
  );
  const recentMeetings = [...input.meetings]
    .sort((a, b) => b.startedAt - a.startedAt)
    .slice(0, 10)
    .map((meeting) => ({
      id: meeting.id,
      zoneId: meeting.zoneId,
      startedAt: meeting.startedAt,
      summary: meeting.summary,
    }));
  return AccountStatus.parse({
    account: input.account,
    contacts: input.contacts,
    commitments: input.commitments,
    openTasks,
    recentMeetings,
    people: input.people,
  });
}

/** Reads the account status from the `Repo` (reads only); unknown ids throw `NotFoundError`. */
export async function accountStatus(
  repo: Repo,
  claims: AuthClaims,
  id: string,
): Promise<AccountStatusType> {
  const account = await repo.account(claims, id);
  if (!account) {
    throw new NotFoundError(`unknown account ${id}`);
  }
  const [contacts, commitments, tasks, projects, meetings, people] = await Promise.all([
    repo.contacts(claims, id),
    repo.commitments(claims, id),
    repo.tasks(claims),
    repo.projects(claims),
    repo.meetings(claims),
    repo.people(claims),
  ]);
  return buildAccountStatus({ account, contacts, commitments, tasks, projects, meetings, people });
}
