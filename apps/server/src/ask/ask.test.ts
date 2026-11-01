import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import {
  AskResult,
  DEMO_ACCOUNT,
  DEMO_COMMITMENT,
  DEMO_MILESTONE,
  DEMO_PROJECT,
  DEMO_QUESTIONS,
  WORKSPACE_ID,
  acmeSyncExpected,
  type AuthClaims,
} from "@office/shared";
import { InMemoryRepo } from "../db/repo.js";
import { FIXTURE_ABSTAIN_MESSAGE, FixtureLlm } from "../llm/fixture.js";
import type { LlmClient } from "../llm/types.js";
import { classifyQuestion } from "./classify.js";
import { ABSTAIN_MESSAGE, fixtureAnswer } from "./fixtureAnswer.js";
import { askQuestion } from "./pipeline.js";
import { retrieveForAsk } from "./retrieve.js";

const MAYA: AuthClaims = { userId: "maya", name: "Maya", workspaceId: WORKSPACE_ID };

const STATUS_QUESTION = DEMO_QUESTIONS[0].question;
const CEO_QUESTION = DEMO_QUESTIONS[1].question;

function fixtureLlm(): LlmClient {
  return new FixtureLlm(fixtureAnswer);
}

/** A scripted LLM: answers are returned in order, calls are counted. */
function scriptedLlm(answers: unknown[]): LlmClient & { calls: number } {
  const llm = {
    calls: 0,
    async extractMeeting(): Promise<unknown> {
      throw new Error("not used by ask");
    },
    async answer(): Promise<unknown> {
      const next = answers[Math.min(llm.calls, answers.length - 1)];
      llm.calls += 1;
      return structuredClone(next);
    },
  };
  return llm;
}

async function approvedRepo(): Promise<InMemoryRepo> {
  const repo = new InMemoryRepo();
  const changes = acmeSyncExpected(randomUUID());
  await repo.saveChanges(MAYA, changes);
  for (const change of changes) {
    await repo.approveChange(MAYA, change.id);
  }
  return repo;
}

describe("classifyQuestion", () => {
  const names = {
    projects: [{ id: DEMO_PROJECT.id, name: DEMO_PROJECT.name }],
    accounts: [{ id: DEMO_ACCOUNT.id, name: DEMO_ACCOUNT.name }],
  };

  it("routes the demo status question to the project", () => {
    expect(classifyQuestion(STATUS_QUESTION, names)).toEqual({
      class: "project_status",
      projectId: DEMO_PROJECT.id,
      accountId: null,
    });
  });

  it("routes 'my day' to my_day", () => {
    expect(classifyQuestion("What is my day looking like?", names).class).toBe("my_day");
  });

  it("routes account questions to the account", () => {
    expect(classifyQuestion("What's going on with Acme?", names)).toEqual({
      class: "account_status",
      projectId: null,
      accountId: DEMO_ACCOUNT.id,
    });
  });

  it("routes decision questions to decision_history", () => {
    expect(classifyQuestion("What did we decide about go-live?", names).class).toBe(
      "decision_history",
    );
  });

  it("routes gibberish to other", () => {
    expect(classifyQuestion("blargh florp xyzzy", names)).toEqual({
      class: "other",
      projectId: null,
      accountId: null,
    });
  });
});

describe("askQuestion", () => {
  it("answers the status question citing records that exist", async () => {
    const repo = new InMemoryRepo();
    const result = await askQuestion({
      repo,
      claims: MAYA,
      userId: "maya",
      question: STATUS_QUESTION,
      llm: fixtureLlm(),
    });
    expect(AskResult.safeParse(result).success).toBe(true);
    expect(result.abstained).toBe(false);
    expect(result.sources.length).toBeGreaterThan(0);
    const known = new Set([
      DEMO_ACCOUNT.id,
      DEMO_PROJECT.id,
      DEMO_MILESTONE.id,
      DEMO_COMMITMENT.id,
      ...(await repo.tasks(MAYA)).map((t) => t.id),
      ...(await repo.meetings(MAYA)).map((m) => m.id),
    ]);
    for (const source of result.sources) {
      expect(known.has(source.id)).toBe(true);
      expect(source.label.trim().length).toBeGreaterThan(0);
    }
    expect(result.answer).toContain("2026-11-15");
  });

  it("abstains for the CEO question", async () => {
    const repo = new InMemoryRepo();
    const result = await askQuestion({
      repo,
      claims: MAYA,
      userId: "maya",
      question: CEO_QUESTION,
      llm: fixtureLlm(),
    });
    expect(result).toEqual({ answer: ABSTAIN_MESSAGE, abstained: true, sources: [] });
  });

  it("abstains when the answer cites an unknown ID, without retrying", async () => {
    const repo = new InMemoryRepo();
    const llm = scriptedLlm([
      { answer: "Bogus.", sourceIds: ["ffffffff-ffff-4fff-8fff-ffffffffffff"] },
    ]);
    const result = await askQuestion({
      repo,
      claims: MAYA,
      userId: "maya",
      question: STATUS_QUESTION,
      llm,
    });
    expect(result.abstained).toBe(true);
    expect(result.sources).toEqual([]);
    expect(llm.calls).toBe(1);
  });

  it("retries once on invalid answer shapes, then abstains", async () => {
    const repo = new InMemoryRepo();
    const llm = scriptedLlm([{ nonsense: true }, "still not json"]);
    const result = await askQuestion({
      repo,
      claims: MAYA,
      userId: "maya",
      question: STATUS_QUESTION,
      llm,
    });
    expect(result.abstained).toBe(true);
    expect(llm.calls).toBe(2);
  });

  it("accepts the retry when the second answer is valid", async () => {
    const repo = new InMemoryRepo();
    const llm = scriptedLlm([
      { nonsense: true },
      { answer: "Go-live is coming.", sourceIds: [DEMO_MILESTONE.id] },
    ]);
    const result = await askQuestion({
      repo,
      claims: MAYA,
      userId: "maya",
      question: STATUS_QUESTION,
      llm,
    });
    expect(result.abstained).toBe(false);
    expect(result.sources).toEqual([
      { type: "milestone", id: DEMO_MILESTONE.id, label: DEMO_MILESTONE.name },
    ]);
    expect(llm.calls).toBe(2);
  });

  it("never calls the LLM for other questions", async () => {
    const repo = new InMemoryRepo();
    const llm = scriptedLlm([{ answer: "x", sourceIds: [] }]);
    const result = await askQuestion({
      repo,
      claims: MAYA,
      userId: "maya",
      question: "blargh florp xyzzy",
      llm,
    });
    expect(result.abstained).toBe(true);
    expect(llm.calls).toBe(0);
  });

  it("abstains for decision history when no meeting exists yet", async () => {
    const repo = new InMemoryRepo();
    const result = await askQuestion({
      repo,
      claims: MAYA,
      userId: "maya",
      question: "What did we decide about go-live?",
      llm: fixtureLlm(),
    });
    expect(result.abstained).toBe(true);
  });

  it("answers decision history from meetings once one exists", async () => {
    const repo = new InMemoryRepo();
    const meeting = await repo.createMeeting(MAYA, {
      zoneId: "acme_room",
      transcript: "Maya: let's move go-live.",
      summary: "Go-live moves to 22 Nov.",
      decisions: [{ text: "Move go-live to 22 November" }],
    });
    const result = await askQuestion({
      repo,
      claims: MAYA,
      userId: "maya",
      question: "What did we decide about go-live?",
      llm: fixtureLlm(),
    });
    expect(result.abstained).toBe(false);
    expect(result.sources.map((s) => s.id)).toContain(meeting.id);
    expect(result.answer).toContain("Move go-live to 22 November");
  });

  it("answers my-day questions from the user's records", async () => {
    const repo = new InMemoryRepo();
    const result = await askQuestion({
      repo,
      claims: MAYA,
      userId: "maya",
      question: "What is my day looking like?",
      llm: fixtureLlm(),
    });
    expect(result.abstained).toBe(false);
    expect(result.answer).toContain("Prepare Acme onboarding guide");
  });

  it("reflects the new date after the demo changes are applied", async () => {
    const repo = await approvedRepo();
    const result = await askQuestion({
      repo,
      claims: MAYA,
      userId: "maya",
      question: STATUS_QUESTION,
      llm: fixtureLlm(),
    });
    expect(result.abstained).toBe(false);
    expect(result.answer).toContain("2026-11-22");
    expect(result.answer).not.toContain("2026-11-15");
  });
});

describe("fixtureAnswer", () => {
  it("uses the same abstain message as FixtureLlm", () => {
    expect(ABSTAIN_MESSAGE).toBe(FIXTURE_ABSTAIN_MESSAGE);
  });

  it("abstains when no records were retrieved", () => {
    expect(fixtureAnswer(STATUS_QUESTION, [])).toEqual({
      answer: ABSTAIN_MESSAGE,
      sourceIds: [],
    });
  });

  it("abstains for the CEO question even with records", async () => {
    const repo = new InMemoryRepo();
    const classified = classifyQuestion(CEO_QUESTION, {
      projects: await repo.projects(MAYA),
      accounts: await repo.accounts(MAYA),
    });
    const retrieved = await retrieveForAsk(repo, MAYA, "maya", classified);
    expect(retrieved.length).toBeGreaterThan(0);
    expect(fixtureAnswer(CEO_QUESTION, retrieved)).toEqual({
      answer: ABSTAIN_MESSAGE,
      sourceIds: [],
    });
  });
});
