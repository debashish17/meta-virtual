import type {
  AccountStatus,
  AskResult,
  Meeting,
  MeetingCreate,
  MeetingProcessResult,
  MyDay,
  ProjectStatus,
  ProposedChange,
} from "@office/shared";

/**
 * The web's data layer (ARCHITECTURE.md 12.6): what the panels and wall displays call.
 * Two implementations: the mock (in memory over the shared demo data) and the http api
 * (P3-C). One contract suite (`contract.ts`) runs against both so they cannot drift.
 */
export interface OfficeApi {
  myDay(): Promise<MyDay>;
  projectStatus(id: string): Promise<ProjectStatus>;
  accountStatus(id: string): Promise<AccountStatus>;
  listPending(meetingId?: string): Promise<ProposedChange[]>;
  processMeeting(input: MeetingCreate): Promise<MeetingProcessResult>;
  approve(id: string): Promise<void>;
  reject(id: string): Promise<void>;
  ask(question: string): Promise<AskResult>;
  meeting(id: string): Promise<Meeting>;
}
