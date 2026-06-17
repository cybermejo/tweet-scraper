import Papa from "papaparse";
import { enrich } from "./analysis.js";

/* ============================================================
 * CSV PARSING
 * ============================================================ */

export const FIELD_MAP = {
  text: ["text", "content", "tweet", "body", "message", "full_text"],
  date: ["createdAt", "created_at", "date", "timestamp", "time"],
  likes: ["likeCount", "likes", "favorite_count", "favoriteCount", "like"],
  rts: ["retweetCount", "retweets", "retweet_count"],
  replies: ["replyCount", "replies", "reply_count"],
  views: ["viewCount", "views", "view_count", "impressions"],
  author: ["authorUsername", "author", "user", "username", "screen_name"],
  url: ["url", "tweet_url", "link"],
  id: ["id", "id_str", "tweet_id"],
  brand: ["sourceTerm", "brand", "query", "searchTerm", "topic"],
};

export function pick(row, candidates) {
  const keys = Object.keys(row);
  for (const c of candidates) {
    const k = keys.find((k) => k.toLowerCase() === c.toLowerCase());
    if (k !== undefined) return row[k];
  }
  return "";
}

export function toNum(v) {
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/,/g, ""));
  return isNaN(n) ? 0 : n;
}

export function normalize(row) {
  const text = String(pick(row, FIELD_MAP.text) || "");
  return {
    id: String(pick(row, FIELD_MAP.id) || ""),
    url: String(pick(row, FIELD_MAP.url) || ""),
    date: String(pick(row, FIELD_MAP.date) || ""),
    author: String(pick(row, FIELD_MAP.author) || ""),
    brand: String(pick(row, FIELD_MAP.brand) || ""),
    text,
    likes: toNum(pick(row, FIELD_MAP.likes)),
    retweets: toNum(pick(row, FIELD_MAP.rts)),
    replies: toNum(pick(row, FIELD_MAP.replies)),
    views: toNum(pick(row, FIELD_MAP.views)),
  };
}

// Above this size, parse on a background worker so a big paste/upload doesn't
// freeze the UI. Small inputs parse on the main thread — the worker's
// serialization overhead makes it slower for them, and PapaParse falls back to
// synchronous parsing anyway when no Worker global exists (e.g. in tests).
const WORKER_THRESHOLD_BYTES = 512 * 1024;

export function parseCSV(text) {
  return new Promise((resolve, reject) => {
    Papa.parse(text, {
      header: true,
      skipEmptyLines: true,
      worker: text.length > WORKER_THRESHOLD_BYTES,
      complete: (res) => {
        const rows = (res.data || [])
          .map(normalize)
          .filter((r) => r.text)
          .map((r, i) => enrich({ ...r, uid: r.id || `tw_${i}` }));
        resolve(rows);
      },
      error: reject,
    });
  });
}
