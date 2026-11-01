import { describe, expect, it } from "vitest";
import { FixtureLlm } from "./fixture.js";
import { MetaLlm } from "./meta.js";
import { createLlm } from "./factory.js";

describe("createLlm", () => {
  it("uses FixtureLlm with no key", () => {
    expect(createLlm({})).toBeInstanceOf(FixtureLlm);
    expect(createLlm({ apiKey: "" })).toBeInstanceOf(FixtureLlm);
  });

  it("uses the Meta adapter when a key is configured", () => {
    const llm = createLlm({
      apiKey: "test-key",
      baseURL: "https://api.meta.ai/v1",
      model: "muse-spark-1.3",
    });
    expect(llm).toBeInstanceOf(MetaLlm);
  });
});
