import { describe, expect, it } from "vitest";
import { receiptsKey, useReceiptsStore } from "./store";

describe("receipts store", () => {
  it("keys queries by value, not by object identity", () => {
    expect(receiptsKey({})).toBe(receiptsKey({}));
    expect(receiptsKey({ accountId: "a" })).toBe(receiptsKey({ accountId: "a" }));
    expect(receiptsKey({ accountId: "a" })).not.toBe(receiptsKey({ projectId: "a" }));
  });

  it("loads through the receipts api (the empty mock offline) and caches by key", async () => {
    useReceiptsStore.setState({ byKey: {} });
    const items = await useReceiptsStore.getState().load({});
    expect(items).toEqual([]);
    expect(useReceiptsStore.getState().byKey[receiptsKey({})]).toEqual([]);
  });
});
