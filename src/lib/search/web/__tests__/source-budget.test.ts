import { describe, it, expect } from "vitest";
import { budgetFamily, createSourceBudget } from "../source-budget";

describe("budgetFamily", () => {
  it("maps paid source ids to their billing family", () => {
    expect(budgetFamily("exa")).toBe("exa");
    expect(budgetFamily("exa-news")).toBe("exa");
    expect(budgetFamily("brave")).toBe("brave");
    expect(budgetFamily("brave-news")).toBe("brave");
    expect(budgetFamily("brave-reddit")).toBe("brave");
    expect(budgetFamily("newsdata")).toBe("newsdata");
  });

  it("returns null for free / uncapped sources", () => {
    for (const id of ["searxng", "hackernews", "stackexchange", "youtube"]) {
      expect(budgetFamily(id)).toBeNull();
    }
  });
});

describe("createSourceBudget (in-memory, injected clock + caps)", () => {
  it("allows spend under the cap and blocks once the cap is reached", async () => {
    const budget = createSourceBudget({ now: () => 0, redis: null, caps: { exa: 2 } });
    expect(await budget.canSpend("exa")).toBe(true);
    await budget.recordSpend("exa");
    expect(await budget.canSpend("exa")).toBe(true); // 1 < 2
    await budget.recordSpend("exa");
    expect(await budget.canSpend("exa")).toBe(false); // 2 >= 2
  });

  it("never caps a free source", async () => {
    const budget = createSourceBudget({ now: () => 0, redis: null, caps: { exa: 1 } });
    expect(await budget.canSpend("searxng")).toBe(true);
    await budget.recordSpend("searxng");
    expect(await budget.canSpend("searxng")).toBe(true);
  });

  it("resets the count on a new day", async () => {
    let t = 0;
    const budget = createSourceBudget({ now: () => t, redis: null, caps: { brave: 1 } });
    await budget.recordSpend("brave");
    expect(await budget.canSpend("brave")).toBe(false);
    t = 1000 * 60 * 60 * 24 * 2; // +2 days
    expect(await budget.canSpend("brave")).toBe(true);
  });

  it("fails OPEN (allows the call) when the counter store errors — never blocks search", async () => {
    const brokenRedis = {
      get: async () => {
        throw new Error("redis down");
      },
      incr: async () => {
        throw new Error("redis down");
      },
      expire: async () => {
        throw new Error("redis down");
      },
    };
    const budget = createSourceBudget({ now: () => 0, redis: brokenRedis, caps: { exa: 1 } });
    expect(await budget.canSpend("exa")).toBe(true);
  });
});
