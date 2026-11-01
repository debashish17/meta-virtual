import { describe, expect, it } from "vitest";
import { ACME_SYNC_TRANSCRIPT, ExtractionResult } from "@office/shared";
import { FIXTURE_ABSTAIN_MESSAGE, FixtureLlm } from "./fixture.js";
import type { LlmClient } from "./types.js";

describe("FixtureLlm", () => {
  it("extracts the acme-sync transcript into a valid ExtractionResult", async () => {
    const llm: LlmClient = new FixtureLlm();
    const raw = await llm.extractMeeting(ACME_SYNC_TRANSCRIPT, { zoneId: "acme_room" });
    const parsed = ExtractionResult.safeParse(raw);
    expect(parsed.success).toBe(true);
    if (!parsed.success) {
      return;
    }
    expect(parsed.data.summary.length).toBeGreaterThan(0);
    expect(parsed.data.milestoneChanges).toEqual([
      {
        projectName: "Acme Payments Integration",
        milestoneName: "Go-live",
        newTargetDate: "2026-11-22",
      },
    ]);
    expect(parsed.data.commitments).toEqual([
      { text: "Go-live by 22 Nov", accountName: "Acme Corp", dueDate: "2026-11-22" },
    ]);
    expect(parsed.data.tasks.map((t) => t.action).sort()).toEqual(["create", "update"]);
  });

  it("returns a summary-only result for any other transcript", async () => {
    const llm: LlmClient = new FixtureLlm();
    const raw = await llm.extractMeeting("Maya: hello\nArjun: hi there", {
      zoneId: "acme_room",
    });
    const parsed = ExtractionResult.safeParse(raw);
    expect(parsed.success).toBe(true);
    if (!parsed.success) {
      return;
    }
    expect(parsed.data.summary).toContain("Maya: hello");
    expect(parsed.data.decisions).toEqual([]);
    expect(parsed.data.tasks).toEqual([]);
    expect(parsed.data.commitments).toEqual([]);
    expect(parsed.data.milestoneChanges).toEqual([]);
  });

  it("abstains by default, until P3-B wires in fixtureAnswer", async () => {
    const llm = new FixtureLlm();
    await expect(llm.answer("Who is Acme's CEO?", [])).resolves.toEqual({
      answer: FIXTURE_ABSTAIN_MESSAGE,
      sourceIds: [],
    });
  });

  it("calls the injected answer function with the question and records", async () => {
    const seen: { question: string; records: unknown[] }[] = [];
    const llm = new FixtureLlm((question, records) => {
      seen.push({ question, records });
      return { answer: "from P2-E", sourceIds: ["id-1"] };
    });
    await expect(llm.answer("status?", [{ id: "id-1" }])).resolves.toEqual({
      answer: "from P2-E",
      sourceIds: ["id-1"],
    });
    expect(seen).toEqual([{ question: "status?", records: [{ id: "id-1" }] }]);
  });
});
