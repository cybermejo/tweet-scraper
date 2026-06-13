import { describe, it, expect } from "vitest";
import { overviewStats } from "./stats.js";

function tw(over) {
  return {
    sentiment: { label: "neutral" },
    tones: [],
    likes: 0,
    retweets: 0,
    replies: 0,
    length: 0,
    emoji: 0,
    hashtags: 0,
    engagement: 0,
    ...over,
  };
}

describe("overviewStats", () => {
  it("returns zeros and empties for no tweets", () => {
    const s = overviewStats([]);
    expect(s.total).toBe(0);
    expect(s.byLabel).toEqual({ positive: 0, neutral: 0, negative: 0 });
    expect(s.avgLen).toBe(0);
    expect(s.toneSorted).toEqual([]);
    expect(s.top).toEqual([]);
  });

  it("counts sentiment labels", () => {
    const s = overviewStats([
      tw({ sentiment: { label: "positive" } }),
      tw({ sentiment: { label: "positive" } }),
      tw({ sentiment: { label: "negative" } }),
    ]);
    expect(s.total).toBe(3);
    expect(s.byLabel).toEqual({ positive: 2, neutral: 0, negative: 1 });
  });

  it("sums engagement metrics and averages length/emoji", () => {
    const s = overviewStats([
      tw({ likes: 10, retweets: 2, length: 100, emoji: 2 }),
      tw({ likes: 5, retweets: 0, length: 50, emoji: 0 }),
    ]);
    expect(s.totalLikes).toBe(15);
    expect(s.totalRts).toBe(2);
    expect(s.avgLen).toBe(75); // (100 + 50) / 2
    expect(s.avgEmoji).toBe("1.0"); // (2 + 0) / 2, toFixed(1)
  });

  it("tallies tones sorted by frequency descending", () => {
    const s = overviewStats([
      tw({ tones: ["Excited", "CTA"] }),
      tw({ tones: ["Excited"] }),
    ]);
    expect(s.toneSorted[0]).toEqual(["Excited", 2]);
    expect(s.toneSorted).toContainEqual(["CTA", 1]);
  });

  it("ranks top performers by engagement and caps at 5", () => {
    const tweets = [1, 5, 3, 2, 9, 4, 7].map((e) => tw({ engagement: e }));
    const s = overviewStats(tweets);
    expect(s.top).toHaveLength(5);
    expect(s.top.map((t) => t.engagement)).toEqual([9, 7, 5, 4, 3]);
  });
});
