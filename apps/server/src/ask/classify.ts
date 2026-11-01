/** The ask classes (ARCHITECTURE.md section 8): what to retrieve for a question. */
export type AskClass = "my_day" | "project_status" | "account_status" | "decision_history" | "other";

export interface NameEntry {
  id: string;
  name: string;
}

/** The seeded project and account names the rules match against. */
export interface ClassifyNames {
  projects: NameEntry[];
  accounts: NameEntry[];
}

export interface ClassifiedQuestion {
  class: AskClass;
  projectId: string | null;
  accountId: string | null;
}

const MY_DAY = [/\bmy\s+day\b/, /\bmy\s+tasks?\b/, /\bmy\s+work\b/, /\bmy\s+todos?\b/, /\bmy\s+schedule\b/];

const DECISIONS = [
  /\bdecisions?\b/,
  /\bdecided\b/,
  /\bwhy\s+did\b/,
  /\bwhat\s+did\s+we\s+(decide|agree)/,
  /\bagreed?\b/,
  /\bhistory\b/,
];

/** Corporate suffixes carry no meaning for matching ("Acme" finds "Acme Corp"). */
const NAME_STOPWORDS = new Set(["corp", "inc", "ltd", "llc", "co", "gmbh", "sas", "plc", "pty"]);

function tokens(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9-]+/g)
    .filter((token) => token.length >= 2 && !NAME_STOPWORDS.has(token));
}

interface NameMatch {
  id: string;
  shared: number;
  coverage: number;
}

function matchNames(questionTokens: Set<string>, names: NameEntry[]): NameMatch | null {
  let best: NameMatch | null = null;
  for (const entry of names) {
    const nameTokens = tokens(entry.name);
    if (nameTokens.length === 0) {
      continue;
    }
    const shared = nameTokens.filter((token) => questionTokens.has(token)).length;
    const full = shared === nameTokens.length;
    if (shared < 2 && !full) {
      continue;
    }
    const candidate = { id: entry.id, shared, coverage: shared / nameTokens.length };
    if (
      !best ||
      candidate.shared > best.shared ||
      (candidate.shared === best.shared && candidate.coverage > best.coverage)
    ) {
      best = candidate;
    }
  }
  return best;
}

/**
 * Classifies a question by deterministic rules: "my day" and its variants, decision
 * keywords, then the seeded project and account names (a project wins ties on more
 * shared tokens, an account on fuller coverage). Anything else is `other`.
 *
 * The `LlmClient` contract offers no classifier, so there is no LLM fallback here:
 * the LLM is consulted only later, to compose the answer, and only when retrieval
 * produced records ("then the LLM only if needed").
 */
export function classifyQuestion(question: string, names: ClassifyNames): ClassifiedQuestion {
  const text = question.toLowerCase();
  if (MY_DAY.some((pattern) => pattern.test(text))) {
    return { class: "my_day", projectId: null, accountId: null };
  }
  if (DECISIONS.some((pattern) => pattern.test(text))) {
    return { class: "decision_history", projectId: null, accountId: null };
  }
  const questionTokens = new Set(tokens(question));
  const project = matchNames(questionTokens, names.projects);
  const account = matchNames(questionTokens, names.accounts);
  if (!project && !account) {
    return { class: "other", projectId: null, accountId: null };
  }
  if (
    project &&
    (!account || project.shared > account.shared || project.coverage >= account.coverage)
  ) {
    return { class: "project_status", projectId: project.id, accountId: null };
  }
  if (!account) {
    return { class: "other", projectId: null, accountId: null };
  }
  return { class: "account_status", projectId: null, accountId: account.id };
}
