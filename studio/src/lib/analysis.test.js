import { describe, it, expect } from "vitest";
import {
  tokenize,
  countEmoji,
  analyzeSentiment,
  analyzeTone,
  enrich,
} from "./analysis.js";
import { POSITIVE_EMOJI } from "./lexicons.js";

describe("tokenize", () => {
  it("lowercases, strips punctuation, keeps apostrophes, and drops empties", () => {
    expect(tokenize("Hello, WORLD! it's fun")).toEqual([
      "hello",
      "world",
      "it's",
      "fun",
    ]);
  });

  it("keeps digits", () => {
    expect(tokenize("buy 2 get 1")).toEqual(["buy", "2", "get", "1"]);
  });

  it("returns an empty array for whitespace/punctuation only", () => {
    expect(tokenize("  !!! ")).toEqual([]);
  });
});

describe("countEmoji", () => {
  it("counts every occurrence of emojis from the list", () => {
    expect(countEmoji("🔥🔥🔥 fire", POSITIVE_EMOJI)).toBe(3);
  });

  it("returns 0 when no listed emoji are present", () => {
    expect(countEmoji("plain text", POSITIVE_EMOJI)).toBe(0);
  });
});

describe("analyzeSentiment", () => {
  it("returns neutral for empty text", () => {
    expect(analyzeSentiment("")).toEqual({
      score: 0,
      label: "neutral",
      magnitude: 0,
    });
  });

  it("labels clearly positive text positive", () => {
    expect(analyzeSentiment("I love this, it's amazing!").label).toBe(
      "positive",
    );
  });

  it("labels clearly negative text negative", () => {
    expect(analyzeSentiment("I hate this, it is terrible").label).toBe(
      "negative",
    );
  });

  it("labels text with no sentiment words neutral", () => {
    expect(analyzeSentiment("the meeting is scheduled for noon").label).toBe(
      "neutral",
    );
  });

  it("flips a positive word to negative when negated", () => {
    expect(analyzeSentiment("this is not good").label).toBe("negative");
  });

  it("flips a negative word to positive when negated", () => {
    expect(analyzeSentiment("not bad at all").label).toBe("positive");
  });

  it("boosts magnitude with an intensifier", () => {
    const plain = analyzeSentiment("amazing");
    const boosted = analyzeSentiment("really amazing");
    expect(boosted.magnitude).toBeGreaterThan(plain.magnitude);
    expect(boosted.label).toBe("positive");
  });

  it("treats a positive emoji as positive signal", () => {
    expect(analyzeSentiment("🔥").label).toBe("positive");
  });

  it("treats a sad emoticon as negative signal", () => {
    expect(analyzeSentiment("ok :(").label).toBe("negative");
  });

  it("clamps the score to the [-1, 1] range", () => {
    const s = analyzeSentiment("love love love amazing perfect best 🔥🔥🔥");
    expect(s.score).toBeLessThanOrEqual(1);
    expect(s.score).toBeGreaterThanOrEqual(-1);
  });
});

describe("analyzeTone", () => {
  it("returns an empty array for empty text", () => {
    expect(analyzeTone("")).toEqual([]);
  });

  it("detects a question", () => {
    expect(analyzeTone("What should I do?")).toContain("Question");
  });

  it("detects gratitude", () => {
    expect(analyzeTone("Thank you so much")).toContain("Gratitude");
  });

  it("detects excitement from repeated exclamation marks", () => {
    expect(analyzeTone("this is huge!!")).toContain("Excited");
  });

  it("can return multiple tones at once", () => {
    const tones = analyzeTone("Follow us and join the community");
    expect(tones).toContain("CTA");
    expect(tones).toContain("Community");
  });
});

describe("enrich", () => {
  it("computes engagement as likes + 2*retweets + replies", () => {
    const out = enrich({ text: "hi", likes: 10, retweets: 5, replies: 2 });
    expect(out.engagement).toBe(22);
  });

  it("counts hashtags and mentions and records length", () => {
    const text = "#a #b @x I love it";
    const out = enrich({ text, likes: 0, retweets: 0, replies: 0 });
    expect(out.hashtags).toBe(2);
    expect(out.mentions).toBe(1);
    expect(out.length).toBe(text.length);
  });

  it("attaches sentiment and tones and preserves original fields", () => {
    const out = enrich({
      text: "I love this!",
      likes: 1,
      retweets: 0,
      replies: 0,
      uid: "abc",
    });
    expect(out.sentiment.label).toBe("positive");
    expect(Array.isArray(out.tones)).toBe(true);
    expect(out.uid).toBe("abc");
  });
});
