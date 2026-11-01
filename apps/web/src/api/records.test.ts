import { beforeEach, describe, expect, it } from "vitest";
import { DEMO_MILESTONE } from "@office/shared";
import { api } from "./index.js";
import { useRecords } from "./records.js";

describe("records store", () => {
  beforeEach(async () => {
    useRecords.setState({ myDay: null, pending: [], project: null, account: null, meeting: null });
    await useRecords.getState().load();
  });

  it("loads my day and the demo statuses", () => {
    const state = useRecords.getState();
    expect(state.myDay?.items.length).toBeGreaterThan(0);
    expect(state.project?.milestones.map((m) => m.id)).toContain(DEMO_MILESTONE.id);
    expect(state.account?.commitments.length).toBe(1);
    expect(state.pending).toEqual([]);
    expect(state.meeting).toBeNull();
  });

  it("refetches the slices its kinds name", async () => {
    const { meetingId } = await api.processMeeting({ zoneId: "acme_room", fixture: "acme-sync" });
    await useRecords.getState().refetch(["proposed_changes", "meetings"]);
    const state = useRecords.getState();
    expect(state.pending).toHaveLength(4);
    expect(state.meeting?.id).toBe(meetingId);

    const change = state.pending.find((c) => c.type === "milestone_date")!;
    await api.approve(change.id);
    await useRecords.getState().refetch(["milestones"]);
    expect(
      useRecords.getState().project?.milestones.find((m) => m.id === DEMO_MILESTONE.id)?.targetDate,
    ).toBe("2026-11-22");
  });
});
