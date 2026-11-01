import { describe, expect, it } from "vitest";
import {
  DEMO_ACCOUNT,
  DEMO_COMMITMENT,
  DEMO_MILESTONE,
  DEMO_PROJECT,
  DEMO_QUESTIONS,
} from "@office/shared";
import type { OfficeApi } from "./types.js";

/**
 * The `OfficeApi` contract suite (ARCHITECTURE.md 12.6): the mock and the http api answer
 * the same suite, so they cannot drift. `mock.contract.test.ts` runs it here; P3-C runs it
 * against the server.
 */
export function officeApiContract(make: () => OfficeApi | Promise<OfficeApi>): void {
  describe("OfficeApi contract", () => {
    it("turns the fixture meeting into the four expected pending changes", async () => {
      const api = await make();
      const { meetingId, proposedChanges } = await api.processMeeting({
        zoneId: "acme_room",
        fixture: "acme-sync",
      });
      expect(proposedChanges.map((c) => c.type).sort()).toEqual([
        "commitment_update",
        "milestone_date",
        "task_create",
        "task_reassign",
      ]);
      expect(
        proposedChanges.every((c) => c.status === "pending" && c.sourceMeetingId === meetingId),
      ).toBe(true);
      expect(proposedChanges.find((c) => c.type === "milestone_date")?.after).toEqual({
        targetDate: "2026-11-22",
      });
      expect(await api.listPending()).toHaveLength(4);
      expect(await api.listPending(meetingId)).toHaveLength(4);
      const meeting = await api.meeting(meetingId);
      expect(meeting.zoneId).toBe("acme_room");
      expect(meeting.transcript.length).toBeGreaterThan(0);
    });

    it("approves three and rejects one; my day and the statuses reflect it", async () => {
      const api = await make();
      const { proposedChanges } = await api.processMeeting({
        zoneId: "acme_room",
        fixture: "acme-sync",
      });
      const approve = proposedChanges.filter((c) => c.type !== "task_create");
      const reject = proposedChanges.filter((c) => c.type === "task_create");
      expect(approve).toHaveLength(3);
      expect(reject).toHaveLength(1);
      for (const change of approve) {
        await api.approve(change.id);
      }
      for (const change of reject) {
        await api.reject(change.id);
      }
      expect(await api.listPending()).toHaveLength(0);

      const project = await api.projectStatus(DEMO_PROJECT.id);
      expect(project.milestones.find((m) => m.id === DEMO_MILESTONE.id)?.targetDate).toBe(
        "2026-11-22",
      );
      expect(
        project.tasks.find((t) => t.title === "Fix webhook signature validation")?.ownerId,
      ).toBe("arjun");
      expect(project.tasks.some((t) => t.title === "Notify Acme of new date")).toBe(false);

      const account = await api.accountStatus(DEMO_ACCOUNT.id);
      expect(account.commitments.find((c) => c.id === DEMO_COMMITMENT.id)?.text).toBe(
        "Go-live by 22 Nov",
      );

      const day = await api.myDay();
      expect(day.items.length).toBeGreaterThan(0);
      expect(JSON.stringify(day)).toContain("2026-11-22");
    });

    it("answers the status question with sources and abstains for the CEO question", async () => {
      const api = await make();
      const [statusQuestion, ceoQuestion] = DEMO_QUESTIONS;
      const answer = await api.ask(statusQuestion.question);
      expect(answer.abstained).toBe(false);
      expect(answer.sources.length).toBeGreaterThan(0);
      const ceo = await api.ask(ceoQuestion.question);
      expect(ceo.abstained).toBe(true);
      expect(ceo.sources).toHaveLength(0);
    });

    it("rejects a second decision on the same change", async () => {
      const api = await make();
      const { proposedChanges } = await api.processMeeting({
        zoneId: "acme_room",
        fixture: "acme-sync",
      });
      await api.approve(proposedChanges[0].id);
      await expect(api.approve(proposedChanges[0].id)).rejects.toThrow();
      await expect(api.reject(proposedChanges[0].id)).rejects.toThrow();
      await expect(api.approve("missing")).rejects.toThrow();
    });
  });
}
