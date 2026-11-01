import { MeetingProcessResult, type MeetingProcessResult as MeetingProcessResultData } from "@office/shared";
import { api } from "../api/index.js";
import { useRecords } from "../api/records.js";

/**
 * Process the Acme fixture meeting and refresh every records slice it touches.
 * Shared by the meeting bar and the `__panelsDebug` screenshot hook.
 */
export async function processAcmeMeeting(): Promise<MeetingProcessResultData> {
  const raw = await api.processMeeting({ zoneId: "acme_room", fixture: "acme-sync" });
  const result = MeetingProcessResult.parse(raw);
  await useRecords
    .getState()
    .refetch(["proposed_changes", "meetings", "tasks", "milestones", "commitments"]);
  return result;
}

/** Refresh every records slice after an approval decision. */
export async function refetchAfterDecision(): Promise<void> {
  await useRecords
    .getState()
    .refetch(["proposed_changes", "meetings", "tasks", "milestones", "commitments"]);
}
