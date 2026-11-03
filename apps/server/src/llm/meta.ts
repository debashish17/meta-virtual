import OpenAI from "openai";
import { ExtractionResult } from "@office/shared";
import type { LlmClient, MeetingContext } from "./types.js";

/**
 * An `LlmClient` that accepts the pipeline's validation error on retry, so the second
 * attempt can correct its JSON instead of guessing again. The pipeline probes for this
 * with `supportsFeedback` and otherwise re-calls `extractMeeting`.
 */
export interface FeedbackLlm extends LlmClient {
  extractMeetingWithFeedback(
    transcript: string,
    context: MeetingContext,
    feedback: string,
  ): Promise<unknown>;
}

export function supportsFeedback(llm: LlmClient): llm is FeedbackLlm {
  return (
    "extractMeetingWithFeedback" in llm &&
    typeof (llm as FeedbackLlm).extractMeetingWithFeedback === "function"
  );
}

export type MetaResponseFormat = "json_schema" | "json_object";

/** A subset of the SDK's reasoning-effort values (which also offer `none`). */
export type MetaReasoningEffort = "minimal" | "low" | "medium" | "high" | "xhigh" | "max";

export interface MetaLlmOptions {
  baseURL: string;
  model: string;
  apiKey: string;
  /**
   * `json_schema` (the default) sends the shared schema as a structured-output schema;
   * `json_object` only asks for JSON while the system prompt still carries the schema.
   * Recorded as unverified until P2-D's live check (no key in this build).
   */
  responseFormat?: MetaResponseFormat;
  /** Reasoning effort (default `low`; the parameter name is unverified until the live check). */
  reasoningEffort?: MetaReasoningEffort;
  /** Transport override for tests; the SDK default otherwise. */
  fetch?: typeof fetch;
  /**
   * Debug sink for call metadata (kind, latency, sizes). It never receives the key or
   * record content, and production leaves it unwired.
   */
  onDebug?: (message: string) => void;
}

const ANSWER_SCHEMA = {
  type: "object",
  properties: {
    answer: { type: "string" },
    sourceIds: { type: "array", items: { type: "string" } },
  },
  required: ["answer", "sourceIds"],
  additionalProperties: false,
} as const;

function stripFences(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith("```")) {
    return trimmed;
  }
  return trimmed
    .replace(/^```[a-zA-Z]*\n/, "")
    .replace(/\n```$/, "")
    .trim();
}

function parseContent(content: string): unknown {
  try {
    return JSON.parse(stripFences(content)) as unknown;
  } catch {
    // Not JSON: return it raw so the pipeline's validation fails, retries, then falls back.
    return content;
  }
}

/**
 * Muse Spark through the Meta Model API (ARCHITECTURE.md 12.5, decision D5), called with
 * OpenAI's SDK over Chat Completions. Returns raw output; the pipelines validate with Zod.
 * It never logs the key, and record content never leaves the request body.
 */
export class MetaLlm implements FeedbackLlm {
  private readonly client: OpenAI;
  private readonly model: string;
  private readonly responseFormat: MetaResponseFormat;
  private readonly reasoningEffort: MetaReasoningEffort;
  private readonly onDebug: ((message: string) => void) | undefined;

  constructor(options: MetaLlmOptions) {
    this.client = new OpenAI({
      baseURL: options.baseURL,
      apiKey: options.apiKey,
      timeout: 30_000,
      maxRetries: 1,
      fetch: options.fetch,
    });
    this.model = options.model;
    this.responseFormat = options.responseFormat ?? "json_schema";
    this.reasoningEffort = options.reasoningEffort ?? "low";
    this.onDebug = options.onDebug;
  }

  async extractMeeting(transcript: string, context: MeetingContext): Promise<unknown> {
    const started = Date.now();
    const content = await this.complete(
      extractionSystem(context),
      `Transcript:\n${transcript}`,
      extractionJsonSchema(),
    );
    this.onDebug?.(
      `extractMeeting model=${this.model} ms=${Date.now() - started} ` +
        `inChars=${transcript.length} outChars=${content.length}`,
    );
    return parseContent(content);
  }

  async extractMeetingWithFeedback(
    transcript: string,
    context: MeetingContext,
    feedback: string,
  ): Promise<unknown> {
    const started = Date.now();
    const content = await this.complete(
      extractionSystem(context),
      `Transcript:\n${transcript}\n\nYour previous reply failed validation:\n${feedback}\n` +
        `Reply with corrected JSON only, matching the schema.`,
      extractionJsonSchema(),
    );
    this.onDebug?.(
      `extractMeetingWithFeedback model=${this.model} ms=${Date.now() - started} ` +
        `inChars=${transcript.length} outChars=${content.length}`,
    );
    return parseContent(content);
  }

  async answer(question: string, records: unknown[], context?: string): Promise<unknown> {
    const started = Date.now();
    const content = await this.complete(
      "You answer questions about the office using ONLY the records given. " +
        'Reply with JSON only: {"answer": string, "sourceIds": string[]}. ' +
        "Every sourceId must be one of the record ids given. If no record answers the " +
        'question, reply {"answer": "I don\'t have a record of that.", "sourceIds": []}. ' +
        "Never invent facts. A Context line, when given, says who is asking and what the records are.",
      `Question: ${question}\n${context ? `Context: ${context}\n` : ""}\nRecords:\n${JSON.stringify(records)}`,
      ANSWER_SCHEMA as unknown as Record<string, unknown>,
    );
    this.onDebug?.(
      `answer model=${this.model} ms=${Date.now() - started} records=${records.length} ` +
        `outChars=${content.length}`,
    );
    return parseContent(content);
  }

  private async complete(
    system: string,
    user: string,
    schema: Record<string, unknown>,
  ): Promise<string> {
    const responseFormat =
      this.responseFormat === "json_schema"
        ? {
            type: "json_schema" as const,
            json_schema: { name: "result", schema },
          }
        : { type: "json_object" as const };
    const completion = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: responseFormat,
      reasoning_effort: this.reasoningEffort,
    });
    return completion.choices[0]?.message?.content ?? "";
  }
}

function extractionJsonSchema(): Record<string, unknown> {
  // The shared schema serialises itself, so the wire hint can never drift from the contract.
  return ExtractionResult.toJSONSchema() as unknown as Record<string, unknown>;
}

function extractionSystem(context: MeetingContext): string {
  const scope = [
    `zone ${context.zoneId}`,
    context.accountName ? `account ${context.accountName}` : null,
    context.projectName ? `project ${context.projectName}` : null,
  ]
    .filter((part): part is string => part !== null)
    .join(", ");
  return (
    "You extract structured meeting outcomes. Reply with JSON only, matching this JSON schema:\n" +
    `${JSON.stringify(ExtractionResult.toJSONSchema())}\n` +
    `Meeting scope: ${scope}.\n` +
    "Rules: summary is one or two sentences; decisions are what was decided; tasks use " +
    'action "create" for new work and "update" with matchHint for existing work; commitments ' +
    "name their account; milestoneChanges carry ISO dates (YYYY-MM-DD). " +
    "Never invent names, dates or records: use only what the transcript says."
  );
}
