import {
  AskRequest,
  AskResult,
  type AskResult as AskResultType,
  type AskSource,
  type AuthClaims,
} from "@office/shared";
import type { Repo } from "../db/repo.js";
import type { LlmClient } from "../llm/types.js";
import { classifyQuestion } from "./classify.js";
import { ABSTAIN_MESSAGE } from "./fixtureAnswer.js";
import { retrieveForAsk, type RetrievedRecord } from "./retrieve.js";

export interface AskInput {
  repo: Repo;
  claims: AuthClaims;
  /** The asking user: "my day" questions retrieve their records. */
  userId: string;
  question: string;
  llm: LlmClient;
}

interface RawAnswer {
  answer: string;
  sourceIds: string[];
}

/**
 * Validates the LLM's raw `{ answer, sourceIds }` (the server has no zod
 * dependency, so this is a manual check; the final `AskResult` still goes
 * through its shared schema).
 */
function parseRawAnswer(value: unknown): RawAnswer | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const { answer, sourceIds } = value as Record<string, unknown>;
  if (typeof answer !== "string") {
    return null;
  }
  if (!Array.isArray(sourceIds) || !sourceIds.every((id) => typeof id === "string")) {
    return null;
  }
  return { answer, sourceIds };
}

function abstain(): AskResultType {
  return AskResult.parse({ answer: ABSTAIN_MESSAGE, abstained: true, sources: [] });
}

async function answerOnce(
  llm: LlmClient,
  question: string,
  records: RetrievedRecord[],
  context?: string,
): Promise<unknown> {
  try {
    return await llm.answer(question, records, context);
  } catch {
    return null;
  }
}

/**
 * The ask pipeline (ARCHITECTURE.md section 8): classify by rules, retrieve the
 * matching records, abstain when nothing was retrieved or the class is `other`,
 * otherwise let the LLM compose `{ answer, sourceIds }` from only those records.
 * Invalid shapes are retried once; unknown or missing citations abstain.
 */
export async function askQuestion(input: AskInput): Promise<AskResultType> {
  if (!AskRequest.safeParse({ question: input.question }).success) {
    return abstain();
  }
  const question = input.question.trim();
  const [projects, accounts] = await Promise.all([
    input.repo.projects(input.claims),
    input.repo.accounts(input.claims),
  ]);
  const classified = classifyQuestion(question, {
    projects: projects.map((p) => ({ id: p.id, name: p.name })),
    accounts: accounts.map((a) => ({ id: a.id, name: a.name })),
  });
  if (classified.class === "other") {
    return abstain();
  }
  const retrieved = await retrieveForAsk(input.repo, input.claims, input.userId, classified);
  if (retrieved.length === 0) {
    return abstain();
  }

  const byId = new Map(retrieved.map((entry) => [entry.id, entry]));
  // "My day" records are the asker's own, which the records themselves do not say: a live model
  // given Maya's tasks without this answered that it had no record of her day.
  const context =
    classified.class === "my_day"
      ? `Asked by ${input.claims.name}, about their own day. The records are ${input.claims.name}'s ` +
        "own open tasks, the commitments with due dates on the accounts, and recent meetings. " +
        "Summarise what is on their plate, soonest due first, addressed to them."
      : undefined;
  let raw = parseRawAnswer(await answerOnce(input.llm, question, retrieved, context));
  if (!raw) {
    raw = parseRawAnswer(await answerOnce(input.llm, question, retrieved, context));
  }
  if (!raw || raw.answer.trim().length === 0 || raw.sourceIds.length === 0) {
    return abstain();
  }
  const sources: AskSource[] = [];
  for (const id of raw.sourceIds) {
    const entry = byId.get(id);
    if (!entry || sources.some((source) => source.id === id)) {
      if (!entry) {
        return abstain();
      }
      continue;
    }
    sources.push({ type: entry.type, id: entry.id, label: entry.label });
  }
  const result = AskResult.safeParse({ answer: raw.answer.trim(), abstained: false, sources });
  return result.success ? result.data : abstain();
}
