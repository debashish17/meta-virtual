import { MeetingProcessResult, type MeetingProcessResult as MeetingProcessResultData } from "@office/shared";
import { api } from "../api/index.js";
import { useRecords } from "../api/records.js";
import { useBookingsStore } from "../bookings/store.js";

/**
 * Process the Acme fixture meeting and refresh every records slice it touches.
 * Shared by the meeting bar and the `__panelsDebug` screenshot hook.
 * When the Acme room has an open booking (P6-B), its id rides along so the
 * agenda is stored with the meeting; otherwise this is the unbooked path.
 */
export async function processAcmeMeeting(): Promise<MeetingProcessResultData> {
  const booking = useBookingsStore.getState().open.find((item) => item.zoneId === "acme_room");
  const raw = await api.processMeeting(
    booking
      ? { zoneId: "acme_room", fixture: "acme-sync", bookingId: booking.id }
      : { zoneId: "acme_room", fixture: "acme-sync" },
  );
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
