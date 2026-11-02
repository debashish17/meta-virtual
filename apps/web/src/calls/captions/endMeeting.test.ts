import { describe, expect, it, vi } from "vitest";
import type { MeetingProcessResult, ProposedChange } from "@office/shared";
import { NO_SPEECH_NOTICE } from "./assembly.js";
import { endMeeting, postPastedTranscript, postTranscriptAsMeeting } from "./endMeeting.js";

const CHANGE: ProposedChange = {
  id: "ac0e0020-0020-4020-8020-000000000020",
  type: "task_create",
  status: "pending",
  targetId: null,
  before: null,
  after: { title: "Notify Acme of new date" },
  needsReview: false,
  sourceMeetingId: "ac0e0030-0030-4030-8030-000000000030",
};

function result(): MeetingProcessResult {
  return { meetingId: CHANGE.sourceMeetingId, proposedChanges: [CHANGE] };
}

function deps() {
  return {
    api: { processMeeting: vi.fn(async () => result()) },
    refetch: vi.fn(async () => undefined),
  };
}

describe("endMeeting", () => {
  it("posts the assembled transcript with the zone and refreshes the drawer", async () => {
    const d = deps();
    const posted = await endMeeting(d, {
      zoneId: "acme_room",
      segments: [
        { name: "Maya", text: "go-live moves", ts: 1 },
        { name: "Arjun", text: "i will take it", ts: 2 },
      ],
    });

    expect(posted).toEqual({ meetingId: CHANGE.sourceMeetingId, proposedChanges: [CHANGE] });
    expect(d.api.processMeeting).toHaveBeenCalledWith({
      zoneId: "acme_room",
      transcript: "Maya: go-live moves\nArjun: i will take it",
    });
    expect(d.refetch).toHaveBeenCalledWith(["proposed_changes", "meetings"]);
  });

  it("reports no speech instead of creating a meeting from an empty buffer", async () => {
    const d = deps();
    expect(await endMeeting(d, { zoneId: "acme_room", segments: [] })).toEqual({
      notice: NO_SPEECH_NOTICE,
    });
    expect(d.api.processMeeting).not.toHaveBeenCalled();
    expect(d.refetch).not.toHaveBeenCalled();
  });

  it("works without a refetch hook", async () => {
    const d = deps();
    const posted = await endMeeting(
      { api: d.api },
      { zoneId: "acme_room", segments: [{ name: "Maya", text: "hi", ts: 1 }] },
    );
    expect(posted).toEqual({ meetingId: CHANGE.sourceMeetingId, proposedChanges: [CHANGE] });
  });
});

describe("postTranscriptAsMeeting", () => {
  it("posts pasted text through the same pipeline", async () => {
    const d = deps();
    const posted = await postTranscriptAsMeeting(d, {
      zoneId: "acme_room",
      transcript: "Maya: go-live moves to 22 Nov",
    });
    expect(posted).toEqual({ meetingId: CHANGE.sourceMeetingId, proposedChanges: [CHANGE] });
    expect(d.api.processMeeting).toHaveBeenCalledWith({
      zoneId: "acme_room",
      transcript: "Maya: go-live moves to 22 Nov",
    });
  });

  it("reports no speech for blank text and rejects an empty zone", async () => {
    const d = deps();
    expect(await postPastedTranscript(d, { zoneId: "acme_room", text: "   \n  " })).toEqual({
      notice: NO_SPEECH_NOTICE,
    });
    expect(d.api.processMeeting).not.toHaveBeenCalled();
    await expect(postTranscriptAsMeeting(d, { zoneId: "", transcript: "hi" })).rejects.toThrow();
  });
});
