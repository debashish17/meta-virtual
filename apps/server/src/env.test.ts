import { describe, expect, it } from "vitest";
import { loadEnv } from "./env.js";

describe("loadEnv", () => {
  it("boots a bare checkout on the local defaults", () => {
    const env = loadEnv({});
    expect(env.NODE_ENV).toBe("development");
    expect(env.PORT).toBe(2567);
    expect(env.AUTH_MODE).toBe("dev");
    expect(env.LLM_BASE_URL).toBe("https://api.meta.ai/v1");
    expect(env.LLM_MODEL).toBe("muse-spark-1.3");
  });

  it("treats an empty string as unset", () => {
    const env = loadEnv({ PORT: "", AUTH_MODE: "", LLM_API_KEY: "" });
    expect(env.PORT).toBe(2567);
    expect(env.AUTH_MODE).toBe("dev");
    expect(env.LLM_API_KEY).toBe("");
  });

  it("names the bad variable, never its value", () => {
    expect(() => loadEnv({ AUTH_MODE: "magic" })).toThrow("AUTH_MODE");
    expect(() => loadEnv({ AUTH_MODE: "magic" })).not.toThrow("magic");
    expect(() => loadEnv({ PORT: "eighty" })).toThrow("PORT");
    expect(() => loadEnv({ LLM_BASE_URL: "not a url" })).toThrow("LLM_BASE_URL");
  });

  it("refuses AUTH_MODE=dev in production", () => {
    expect(() => loadEnv({ NODE_ENV: "production", AUTH_MODE: "dev" })).toThrow("AUTH_MODE");
    expect(loadEnv({ NODE_ENV: "production", AUTH_MODE: "supabase" }).AUTH_MODE).toBe(
      "supabase",
    );
  });
});
