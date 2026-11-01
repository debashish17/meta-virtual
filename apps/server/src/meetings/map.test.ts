import { describe, expect, it } from "vitest";
import {
  ACME_SYNC_TRANSCRIPT,
  DEMO_COMMITMENT,
  DEMO_MILESTONE,
  DEMO_TASKS,
  ExtractionResult,
  acmeSyncExpected,
  type ProposedChange,
} from "@office/shared";
import { FixtureLlm } from "../llm/fixture.js";
import type { LlmClient } from "../llm/types.js";
import { mapExtractionToChanges } from "./map.js";
import { demoSnapshot } from "./testSnapshot.js";

const MEETING_ID = "00000000-0000-4000-8000-000000000000";

/** Change ids are random per run; everything else must match exactly. */
function comparable(changes: ProposedChange[]): unknown[] {
  return changes.map((c) => ({ ...c, id: "<id>" }));
}

async function fixtureExtraction(): Promise<ExtractionResult> {
  const llm: LlmClient = new FixtureLlm();
  return ExtractionResult.parse(await llm.extractMeeting(ACME_SYNC_TRANSCRIPT, { zoneId: "acme_room" }));
}

describe("mapExtractionToChanges", () => {
  it("maps the fixture extraction to exactly the four expected changes", async () => {
    const extraction = await fixtureExtraction();
    const changes = mapExtractionToChanges(extraction, demoSnapshot(), {
      zoneId: "acme_room",
      meetingId: MEETING_ID,
    });
    expect(changes.map((c) => c.type).sort()).toEqual([
      "commitment_update",
      "milestone_date",
      "task_create",
      "task_reassign",
    ]);
    expect(comparable(changes)).toEqual(comparable(acmeSyncExpected(MEETING_ID)));
    expect(changes.every((c) => c.status === "pending" && c.sourceMeetingId === MEETING_ID)).toBe(true);
    expect(changes.every((c) => c.needsReview === false)).toBe(true);
  });

  it("flags an unknown owner name as needsReview", async () => {
    const extraction = await fixtureExtraction();
    extraction.tasks = [
      { title: "Call the vendor", ownerName: "Zoe", action: "create" },
      {
        title: "Fix webhook signature validation",
        ownerName: "Zoe",
        action: "update",
        matchHint: "Fix webhook signature validation",
      },
    ];
    const changes = mapExtractionToChanges(extraction, demoSnapshot(), {
      zoneId: "acme_room",
      meetingId: MEETING_ID,
    });
    const created = changes.find((c) => c.type === "task_create");
    expect(created?.needsReview).toBe(true);
    expect(created?.targetId).toBeNull();
    expect(created?.after).toMatchObject({ title: "Call the vendor", ownerId: null });
    const reassigned = changes.find((c) => c.type === "task_reassign");
    expect(reassigned?.needsReview).toBe(true);
    expect(reassigned?.targetId).toBe(DEMO_TASKS[0].id);
  });

  it("flags unmatched milestones, commitments and tasks as needsReview", async () => {
    const extraction = await fixtureExtraction();
    extraction.milestoneChanges = [
      { projectName: "Beta Project", milestoneName: "Launch", newTargetDate: "2026-12-01" },
    ];
    extraction.commitments = [{ text: "Ship it", accountName: "Beta Inc" }];
    extraction.tasks = [{ title: "Unknown work", action: "update", matchHint: "no such task" }];
    const changes = mapExtractionToChanges(extraction, demoSnapshot(), {
      zoneId: "acme_room",
      meetingId: MEETING_ID,
    });
    expect(changes).toHaveLength(3);
    expect(changes.every((c) => c.needsReview && c.targetId === null)).toBe(true);
    expect(changes.find((c) => c.type === "milestone_date")?.after).toMatchObject({
      milestoneName: "Launch",
    });
  });

  it("narrows matching to the meeting's room", () => {
    // "Beta Project" exists globally, but outside the Acme room's account scope.
    const snapshot = demoSnapshot();
    snapshot.projects.push({
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      accountId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      name: "Beta Project",
      ownerId: "arjun",
    });
    const extraction = ExtractionResult.parse({
      summary: "Beta talk in the Acme room.",
      decisions: [],
      tasks: [],
      commitments: [],
      milestoneChanges: [
        { projectName: "Beta Project", milestoneName: "Launch", newTargetDate: "2026-12-01" },
      ],
    });
    const changes = mapExtractionToChanges(extraction, snapshot, {
      zoneId: "acme_room",
      meetingId: MEETING_ID,
    });
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ targetId: null, needsReview: true });
  });

  it("matches across all records when the room is unknown", async () => {
    const extraction = await fixtureExtraction();
    const changes = mapExtractionToChanges(extraction, demoSnapshot(), {
      zoneId: "open_plan",
      meetingId: MEETING_ID,
    });
    expect(changes.find((c) => c.type === "milestone_date")).toMatchObject({
      targetId: DEMO_MILESTONE.id,
      needsReview: false,
    });
  });

  it("skips an update that changes nothing", () => {
    const extraction = ExtractionResult.parse({
      summary: "Nothing new.",
      decisions: [],
      tasks: [
        {
          title: "Fix webhook signature validation",
          ownerName: "Maya",
          action: "update",
          matchHint: "Fix webhook signature validation",
        },
      ],
      commitments: [],
      milestoneChanges: [],
    });
    const changes = mapExtractionToChanges(extraction, demoSnapshot(), {
      zoneId: "acme_room",
      meetingId: MEETING_ID,
    });
    expect(changes).toEqual([]);
  });

  it("creates a genuinely new commitment instead of updating", () => {
    const extraction = ExtractionResult.parse({
      summary: "A new promise.",
      decisions: [],
      tasks: [],
      commitments: [{ text: "Provide weekly SLA reports", accountName: "Acme Corp" }],
      milestoneChanges: [],
    });
    const changes = mapExtractionToChanges(extraction, demoSnapshot(), {
      zoneId: "acme_room",
      meetingId: MEETING_ID,
    });
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      type: "commitment_create",
      targetId: null,
      needsReview: false,
    });
    expect(changes[0].after).toMatchObject({
      accountId: DEMO_COMMITMENT.accountId,
      text: "Provide weekly SLA reports",
    });
  });
});
