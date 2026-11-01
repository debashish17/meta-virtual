import type { LlmClient } from "./types.js";
import { FixtureLlm, type AnswerFn } from "./fixture.js";
import { MetaLlm, type MetaReasoningEffort, type MetaResponseFormat } from "./meta.js";

export interface CreateLlmOptions {
  /** Set (from `LLM_API_KEY`) selects the Meta adapter; unset selects `FixtureLlm`. */
  apiKey?: string;
  baseURL?: string;
  model?: string;
  responseFormat?: MetaResponseFormat;
  reasoningEffort?: MetaReasoningEffort;
  fetch?: typeof fetch;
  /**
   * Builds raw answers for `FixtureLlm`. P3-B passes P2-E's `fixtureAnswer` here;
   * until then the fixture abstains.
   */
  answer?: AnswerFn;
  onDebug?: (message: string) => void;
}

/**
 * Builds the server's LLM client: the Meta adapter when a key is configured, otherwise
 * the deterministic fixture. P3-B calls this from `deps.ts`; `/health` already reports
 * which one is running (`llm: <provider>` vs `llm: fixture`).
 */
export function createLlm(options: CreateLlmOptions = {}): LlmClient {
  if (!options.apiKey) {
    return new FixtureLlm(options.answer);
  }
  return new MetaLlm({
    baseURL: options.baseURL ?? "https://api.meta.ai/v1",
    model: options.model ?? "muse-spark-1.3",
    apiKey: options.apiKey,
    responseFormat: options.responseFormat,
    reasoningEffort: options.reasoningEffort,
    fetch: options.fetch,
    onDebug: options.onDebug,
  });
}
