import {
  POSITIVE_WORDS,
  NEGATIVE_WORDS,
  INTENSIFIERS,
  NEGATIONS,
  POSITIVE_EMOJI,
  NEGATIVE_EMOJI,
  NEGATIVE_EMOTICONS,
  TONE_PATTERNS,
} from "./lexicons.js";

/* ============================================================
 * ANALYSIS
 * ============================================================ */

export function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s']/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

export function countEmoji(text, list) {
  let count = 0;
  for (const e of list) {
    const re = new RegExp(e.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&"), "g");
    const m = text.match(re);
    if (m) count += m.length;
  }
  return count;
}

export function analyzeSentiment(text) {
  if (!text) return { score: 0, label: "neutral", magnitude: 0 };
  const tokens = tokenize(text);
  let pos = 0,
    neg = 0;
  for (let i = 0; i < tokens.length; i++) {
    const w = tokens[i];
    const prev = tokens[i - 1] || "";
    const prev2 = tokens[i - 2] || "";
    const boost = INTENSIFIERS.has(prev) ? 1.5 : 1;
    const negated = NEGATIONS.has(prev) || NEGATIONS.has(prev2);
    if (POSITIVE_WORDS.has(w)) {
      if (negated) neg += boost;
      else pos += boost;
    } else if (NEGATIVE_WORDS.has(w)) {
      if (negated) pos += boost;
      else neg += boost;
    }
  }
  pos += countEmoji(text, POSITIVE_EMOJI) * 0.8;
  neg += countEmoji(text, NEGATIVE_EMOJI) * 0.8;
  neg += (text.match(NEGATIVE_EMOTICONS) || []).length * 0.8;
  const raw = pos - neg;
  const norm = raw / Math.max(1, Math.sqrt(pos + neg + 1));
  const score = Math.max(-1, Math.min(1, norm / 3));
  const magnitude = pos + neg;
  let label = "neutral";
  if (score > 0.12) label = "positive";
  else if (score < -0.12) label = "negative";
  return { score, label, magnitude };
}

export function analyzeTone(text) {
  if (!text) return [];
  const exclaim = (text.match(/!/g) || []).length;
  const letters = text.replace(/[^a-zA-Z]/g, "");
  const caps = text.replace(/[^A-Z]/g, "").length;
  const capsRatio = letters.length ? caps / letters.length : 0;
  const emoji =
    countEmoji(text, POSITIVE_EMOJI) + countEmoji(text, NEGATIVE_EMOJI);
  const meta = { exclaim, capsRatio, emoji };
  return TONE_PATTERNS.filter((p) => p.match(text, meta)).map((p) => p.tag);
}

export function enrich(r) {
  const sentiment = analyzeSentiment(r.text);
  const tones = analyzeTone(r.text);
  const engagement = r.likes + r.retweets * 2 + r.replies;
  const emoji =
    countEmoji(r.text, POSITIVE_EMOJI) + countEmoji(r.text, NEGATIVE_EMOJI);
  const hashtags = (r.text.match(/#\w+/g) || []).length;
  const mentions = (r.text.match(/@\w+/g) || []).length;
  return {
    ...r,
    sentiment,
    tones,
    engagement,
    emoji,
    hashtags,
    mentions,
    length: r.text.length,
  };
}
