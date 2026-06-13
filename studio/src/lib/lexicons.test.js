import { describe, it, expect } from "vitest";
import {
  POSITIVE_WORDS,
  NEGATIVE_WORDS,
  POSITIVE_EMOJI,
  NEGATIVE_EMOJI,
  TONE_DEFS,
  TONE_COLOR,
  TONE_PATTERNS,
  CAPTION_TONES,
} from "./lexicons.js";

describe("lexicon integrity", () => {
  it("has no word in both the positive and negative sets", () => {
    const overlap = [...POSITIVE_WORDS].filter((w) => NEGATIVE_WORDS.has(w));
    expect(overlap).toEqual([]);
  });

  it("has no emoji in both the positive and negative lists", () => {
    const neg = new Set(NEGATIVE_EMOJI);
    const overlap = POSITIVE_EMOJI.filter((e) => neg.has(e));
    expect(overlap).toEqual([]);
  });

  it("defines a color for every tone", () => {
    for (const { tag } of TONE_DEFS) {
      expect(TONE_COLOR[tag]).toBeTruthy();
    }
  });

  it("has a tone pattern for every defined tone tag", () => {
    const patternTags = new Set(TONE_PATTERNS.map((p) => p.tag));
    for (const { tag } of TONE_DEFS) {
      expect(patternTags.has(tag)).toBe(true);
    }
  });

  it("only offers caption tones that exist in TONE_DEFS", () => {
    const defined = new Set(TONE_DEFS.map((d) => d.tag));
    for (const tag of CAPTION_TONES) {
      expect(defined.has(tag)).toBe(true);
    }
  });
});
