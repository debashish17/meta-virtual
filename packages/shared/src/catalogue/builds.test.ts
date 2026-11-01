import { describe, expect, it } from "vitest";
import builds from "./builds.generated.json";
import catalogue from "./catalogue.generated.json";
import { BuildItem, Builds, verdictOf } from "./builds.js";
import { Catalogue } from "./schema.js";

describe("generated builds (blender-asset-pipeline/run.py build)", () => {
  const parsed = Builds.safeParse(builds);
  const cat = Catalogue.parse(catalogue);

  it("matches the schema", () => {
    expect(parsed.error?.issues ?? []).toEqual([]);
  });

  it("accounts for every catalogue part: built or reported as a failure", () => {
    const parts = cat.items.filter((i) => i.kind === "part").map((i) => i.id).sort();
    const covered = [...(parsed.data?.items ?? []).map((b) => b.id), ...(parsed.data?.failures ?? []).map((f) => f.id)];
    expect(covered.sort()).toEqual(parts);
  });

  it("only builds catalogue parts, with the catalogue's family", () => {
    const families = new Map(cat.items.map((i) => [i.id, i.family]));
    for (const b of parsed.data?.items ?? []) expect(families.get(b.id), b.id).toBe(b.family);
  });

  it("never reports a size check as passed when the board printed no size", () => {
    const sized = (i: (typeof cat.items)[number]) => !!i.dimsMm && Object.values(i.dimsMm).some((v) => v !== null);
    const noSize = new Set(cat.items.filter((i) => !sized(i)).map((i) => i.id));
    for (const b of parsed.data?.items ?? []) {
      const status = b.checks.find((c) => c.name === "label_size")?.status;
      if (noSize.has(b.id)) expect(status, b.id).toBe("unchecked");
      if (noSize.has(b.id)) expect(b.qa, b.id).not.toBe("pass");
    }
  });
});

describe("build verdict rule", () => {
  const checks = (...statuses: ("pass" | "fail" | "unchecked")[]) => statuses.map((status) => ({ status }));

  it("derives fail > unchecked > pass", () => {
    expect(verdictOf(checks("pass", "unchecked", "fail"))).toBe("fail");
    expect(verdictOf(checks("pass", "unchecked"))).toBe("unchecked");
    expect(verdictOf(checks("pass", "pass"))).toBe("pass");
  });

  it("rejects a build whose verdict disagrees with its checks", () => {
    const sample = Builds.parse(builds).items[0];
    const forged = { ...sample, qa: "pass", checks: [...sample.checks, { name: "x", status: "fail", detail: "" }] };
    expect(BuildItem.safeParse(forged).success).toBe(false);
  });
});
