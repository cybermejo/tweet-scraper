import { describe, it, expect } from "vitest";
import { pick, toNum, normalize, parseCSV } from "./csv.js";

describe("toNum", () => {
  it("strips commas from numeric strings", () => {
    expect(toNum("1,234")).toBe(1234);
  });

  it("passes numbers through", () => {
    expect(toNum(42)).toBe(42);
  });

  it("parses decimals", () => {
    expect(toNum("12.5")).toBe(12.5);
  });

  it("returns 0 for non-numeric and empty input", () => {
    expect(toNum("abc")).toBe(0);
    expect(toNum("")).toBe(0);
  });
});

describe("pick", () => {
  it("matches a candidate key case-insensitively", () => {
    expect(pick({ Text: "hi" }, ["text"])).toBe("hi");
  });

  it("returns the first matching candidate in order", () => {
    expect(pick({ content: "c", text: "t" }, ["text", "content"])).toBe("t");
  });

  it("returns empty string when nothing matches", () => {
    expect(pick({ foo: "x" }, ["bar"])).toBe("");
  });
});

describe("normalize", () => {
  it("maps aliased columns onto the canonical shape", () => {
    const row = normalize({
      content: "hello",
      favorite_count: "5",
      retweet_count: "3",
      author: "bob",
    });
    expect(row.text).toBe("hello");
    expect(row.likes).toBe(5);
    expect(row.retweets).toBe(3);
    expect(row.author).toBe("bob");
  });

  it("falls back to defaults for missing fields", () => {
    const row = normalize({ text: "only text" });
    expect(row.id).toBe("");
    expect(row.url).toBe("");
    expect(row.replies).toBe(0);
    expect(row.views).toBe(0);
  });
});

describe("parseCSV", () => {
  it("parses, enriches, and drops rows without text", async () => {
    const csv = [
      "text,likeCount,authorUsername",
      "hello world,10,alice",
      ",5,bob",
      "great job,2,carol",
    ].join("\n");
    const rows = await parseCSV(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0].text).toBe("hello world");
    expect(rows[0].likes).toBe(10);
    expect(rows[0].sentiment).toBeDefined();
    expect(Array.isArray(rows[0].tones)).toBe(true);
  });

  it("assigns a synthetic uid when no id column is present", async () => {
    const csv = ["text", "first tweet", "second tweet"].join("\n");
    const rows = await parseCSV(csv);
    expect(rows.map((r) => r.uid)).toEqual(["tw_0", "tw_1"]);
  });

  it("uses the id column for uid when present", async () => {
    const csv = ["id,text", "999,hello there"].join("\n");
    const rows = await parseCSV(csv);
    expect(rows[0].uid).toBe("999");
  });
});
