import { describe, expect, it } from "vitest";
import { MetaLlm } from "./meta.js";

interface CapturedRequest {
  url: string;
  body: Record<string, unknown>;
  authorization: string | null;
}

function chatCompletion(content: string): Response {
  return new Response(
    JSON.stringify({
      id: "chatcmpl-test",
      object: "chat.completion",
      created: 1,
      model: "muse-spark-1.3",
      choices: [
        {
          index: 0,
          message: { role: "assistant", content },
          finish_reason: "stop",
        },
      ],
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

/** A transport stub: captures the request and answers with canned assistant content. */
function stubTransport(content: string, captured: CapturedRequest[]): typeof fetch {
  return async (...args: Parameters<typeof fetch>): Promise<Response> => {
    const [url, init] = args;
    const headers = new Headers(init?.headers);
    captured.push({
      url: String(url),
      body: JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>,
      authorization: headers.get("authorization"),
    });
    return chatCompletion(content);
  };
}

const OPTIONS = { baseURL: "https://api.meta.ai/v1", model: "muse-spark-1.3", apiKey: "secret-key" };

describe("MetaLlm", () => {
  it("requests JSON-schema output with low reasoning effort and parses the reply", async () => {
    const captured: CapturedRequest[] = [];
    const llm = new MetaLlm({ ...OPTIONS, fetch: stubTransport('{"summary":"s"}', captured) });
    await expect(
      llm.extractMeeting("Maya: hi", { zoneId: "acme_room" }),
    ).resolves.toEqual({ summary: "s" });
    expect(captured).toHaveLength(1);
    const body = captured[0].body;
    expect(body["model"]).toBe("muse-spark-1.3");
    expect(body["reasoning_effort"]).toBe("low");
    const format = body["response_format"] as { type: string; json_schema: { schema: object } };
    expect(format.type).toBe("json_schema");
    expect(JSON.stringify(format.json_schema.schema)).toContain("milestoneChanges");
    const messages = body["messages"] as { role: string; content: string }[];
    expect(messages[0].content).toContain("Reply with JSON only");
    expect(messages[1].content).toContain("Maya: hi");
  });

  it("hands the model the question's context with the records", async () => {
    const captured: CapturedRequest[] = [];
    const llm = new MetaLlm({ ...OPTIONS, fetch: stubTransport('{"answer":"a","sourceIds":[]}', captured) });
    await llm.answer("What does my day look like?", [{ id: "t1" }], "Asked by Maya. The records are Maya's own open tasks.");
    const messages = captured[0].body["messages"] as { role: string; content: string }[];
    expect(messages[1].content).toContain("Asked by Maya. The records are Maya's own open tasks.");
    expect(messages[1].content).toContain("What does my day look like?");
  });

  it("supports the json_object fallback mode", async () => {
    const captured: CapturedRequest[] = [];
    const llm = new MetaLlm({
      ...OPTIONS,
      responseFormat: "json_object",
      fetch: stubTransport("{}", captured),
    });
    await llm.extractMeeting("Maya: hi", { zoneId: "acme_room" });
    expect(captured).toHaveLength(1);
    expect(captured[0].body["response_format"]).toEqual({ type: "json_object" });
    // The schema still travels in the system prompt, so validation is unchanged.
    const messages = captured[0].body["messages"] as { role: string; content: string }[];
    expect(messages[0].content).toContain("milestoneChanges");
  });

  it("returns non-JSON replies raw, so the pipeline retries and falls back", async () => {
    const captured: CapturedRequest[] = [];
    const llm = new MetaLlm({ ...OPTIONS, fetch: stubTransport("not json", captured) });
    await expect(llm.extractMeeting("Maya: hi", { zoneId: "acme_room" })).resolves.toBe("not json");
  });

  it("sends the validation error on the feedback retry", async () => {
    const captured: CapturedRequest[] = [];
    const llm = new MetaLlm({ ...OPTIONS, fetch: stubTransport("{}", captured) });
    await llm.extractMeetingWithFeedback("Maya: hi", { zoneId: "acme_room" }, "summary: Required");
    expect(captured).toHaveLength(1);
    const messages = captured[0].body["messages"] as { role: string; content: string }[];
    expect(messages[1].content).toContain("summary: Required");
    expect(messages[1].content).toContain("Maya: hi");
  });

  it("answers with records in the prompt and parses { answer, sourceIds }", async () => {
    const captured: CapturedRequest[] = [];
    const llm = new MetaLlm({
      ...OPTIONS,
      fetch: stubTransport('{"answer":"a","sourceIds":["1"]}', captured),
    });
    await expect(llm.answer("status?", [{ id: "1" }])).resolves.toEqual({
      answer: "a",
      sourceIds: ["1"],
    });
    const messages = captured[0].body["messages"] as { role: string; content: string }[];
    expect(messages[1].content).toContain("status?");
    expect(messages[1].content).toContain('"id":"1"');
  });

  it("never puts the key in the request body", async () => {
    const captured: CapturedRequest[] = [];
    const debug: string[] = [];
    const llm = new MetaLlm({
      ...OPTIONS,
      fetch: stubTransport("{}", captured),
      onDebug: (message) => debug.push(message),
    });
    await llm.extractMeeting("Maya: hi", { zoneId: "acme_room" });
    expect(JSON.stringify(captured[0].body)).not.toContain("secret-key");
    expect(captured[0].authorization).toBe("Bearer secret-key");
    expect(debug.join("\n")).not.toContain("secret-key");
    expect(debug.join("\n")).not.toContain("Maya: hi");
  });

  it("adds the booking agenda to the extraction prompt when present", async () => {
    const captured: CapturedRequest[] = [];
    const llm = new MetaLlm({ ...OPTIONS, fetch: stubTransport("{}", captured) });
    await llm.extractMeeting("Maya: hi", { zoneId: "acme_room", agenda: "Review the go-live checklist" });
    expect(captured).toHaveLength(1);
    const messages = captured[0].body["messages"] as { role: string; content: string }[];
    expect(messages[0].content).toContain("Meeting agenda: Review the go-live checklist");
  });
});
