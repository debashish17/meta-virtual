import { ProjectStatus, type AuthClaims, type Meeting, type Milestone, type PersonRef, type Project, type ProjectStatus as ProjectStatusType, type Task } from "@office/shared";
import { NotFoundError, type Repo } from "../db/repo.js";

/** Everything `buildProjectStatus` shapes; `projectStatus` reads it from the `Repo`. */
export interface ProjectStatusInput {
  project: Project;
  milestones: Milestone[];
  tasks: Task[];
  meetings: Meeting[];
  people: PersonRef[];
}

/** Builds the project status (pure): milestones, tasks, the latest decisions, owners. */
export function buildProjectStatus(input: ProjectStatusInput): ProjectStatusType {
  return ProjectStatus.parse({
    project: input.project,
    milestones: input.milestones,
    tasks: input.tasks,
    decisions: input.meetings.flatMap((meeting) =>
      meeting.decisions.map((decision) => ({ text: decision.text, meetingId: meeting.id })),
    ),
    people: input.people,
  });
}

/** Reads the project status from the `Repo` (reads only); unknown ids throw `NotFoundError`. */
export async function projectStatus(
  repo: Repo,
  claims: AuthClaims,
  id: string,
): Promise<ProjectStatusType> {
  const project = await repo.project(claims, id);
  if (!project) {
    throw new NotFoundError(`unknown project ${id}`);
  }
  const [milestones, tasks, meetings, people] = await Promise.all([
    repo.milestones(claims, id),
    repo.tasks(claims, { projectId: id }),
    repo.meetings(claims),
    repo.people(claims),
  ]);
  return buildProjectStatus({ project, milestones, tasks, meetings, people });
}
