import { useState, useMemo } from "react";
import { Heart, Repeat2, MessageSquare, Eye, Wand2, X } from "lucide-react";
import { Chip, SentimentChip } from "./primitives.jsx";
import { TONE_DEFS, TONE_COLOR } from "../lib/lexicons.js";
import { MAX_VISIBLE, capNotice } from "../lib/display.js";

/* ============================================================
 * TWEETS TAB
 * ============================================================ */

export function TweetsTab({ tweets, selection, onJumpToCaptions }) {
  const [q, setQ] = useState("");
  const [sentFilter, setSentFilter] = useState("all");
  const [toneFilter, setToneFilter] = useState("all");
  const [sortKey, setSortKey] = useState("engagement");
  const [onlySelected, setOnlySelected] = useState(false);

  const matched = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return tweets
      .filter(
        (t) =>
          !needle ||
          t.text.toLowerCase().includes(needle) ||
          t.author.toLowerCase().includes(needle) ||
          t.brand.toLowerCase().includes(needle),
      )
      .filter((t) => sentFilter === "all" || t.sentiment.label === sentFilter)
      .filter((t) => toneFilter === "all" || t.tones.includes(toneFilter))
      .filter((t) => !onlySelected || selection.has(t.uid))
      .sort((a, b) => {
        if (sortKey === "engagement") return b.engagement - a.engagement;
        if (sortKey === "sentiment")
          return b.sentiment.score - a.sentiment.score;
        if (sortKey === "date")
          return (b.date || "").localeCompare(a.date || "");
        return 0;
      });
  }, [tweets, q, sentFilter, toneFilter, sortKey, onlySelected, selection]);

  const filtered = useMemo(() => matched.slice(0, MAX_VISIBLE), [matched]);
  const notice = capNotice(matched.length);

  const visibleIds = useMemo(() => filtered.map((t) => t.uid), [filtered]);
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selection.has(id));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex-1 min-w-[200px] relative">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search text, author, brand..."
            className="w-full pl-3 pr-8 py-2 border border-slate-200 rounded-lg text-sm"
          />
          {q && (
            <button
              onClick={() => setQ("")}
              className="absolute right-2 top-2 text-slate-400 hover:text-slate-600"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <select
          value={sentFilter}
          onChange={(e) => setSentFilter(e.target.value)}
          className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
        >
          <option value="all">All sentiment</option>
          <option value="positive">Positive</option>
          <option value="neutral">Neutral</option>
          <option value="negative">Negative</option>
        </select>
        <select
          value={toneFilter}
          onChange={(e) => setToneFilter(e.target.value)}
          className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
        >
          <option value="all">All tones</option>
          {TONE_DEFS.map((t) => (
            <option key={t.tag} value={t.tag}>
              {t.tag}
            </option>
          ))}
        </select>
        <select
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value)}
          className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
        >
          <option value="engagement">Sort: Engagement</option>
          <option value="sentiment">Sort: Sentiment</option>
          <option value="date">Sort: Date</option>
        </select>
        <label className="inline-flex items-center gap-1.5 text-xs text-slate-600 px-2 py-1.5 border border-slate-200 rounded-lg bg-white cursor-pointer">
          <input
            type="checkbox"
            checked={onlySelected}
            onChange={(e) => setOnlySelected(e.target.checked)}
            className="accent-indigo-600"
          />
          Selected only
        </label>
        <span className="text-xs text-slate-500 ml-auto">
          {matched.length} of {tweets.length}
        </span>
      </div>

      {notice && (
        <div className="text-xs text-slate-500 -mt-1 px-1">{notice}</div>
      )}

      <div className="flex flex-wrap items-center gap-2 bg-indigo-50/60 border border-indigo-100 rounded-xl p-3 text-sm">
        <span className="font-medium text-indigo-900">
          {selection.count} selected
        </span>
        <span className="text-indigo-700/70">·</span>
        <button
          onClick={() =>
            allVisibleSelected
              ? selection.remove(visibleIds)
              : selection.add(visibleIds)
          }
          disabled={!visibleIds.length}
          className="px-2.5 py-1 rounded-md text-xs font-medium bg-white border border-indigo-200 text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
        >
          {allVisibleSelected
            ? "Unselect visible"
            : `Select all visible (${visibleIds.length})`}
        </button>
        <button
          onClick={selection.clear}
          disabled={!selection.count}
          className="px-2.5 py-1 rounded-md text-xs font-medium bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 disabled:opacity-50"
        >
          Clear all
        </button>
        {selection.count > 0 && (
          <button
            onClick={onJumpToCaptions}
            className="ml-auto inline-flex items-center gap-1 px-3 py-1 rounded-md text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-700"
          >
            <Wand2 className="w-3.5 h-3.5" /> Use in Caption Studio
          </button>
        )}
      </div>

      <div className="space-y-2">
        {filtered.map((t) => {
          const checked = selection.has(t.uid);
          return (
            <label
              key={t.uid}
              className={`block bg-white border rounded-xl p-4 shadow-sm cursor-pointer transition ${checked ? "border-indigo-400 ring-1 ring-indigo-200 bg-indigo-50/30" : "border-slate-200 hover:border-slate-300"}`}
            >
              <div className="flex gap-3">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => selection.toggle(t.uid)}
                  className="mt-1 w-4 h-4 accent-indigo-600 shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <span className="text-sm font-medium text-slate-900">
                      @{t.author || "unknown"}
                    </span>
                    {t.brand && <Chip>{t.brand}</Chip>}
                    <SentimentChip label={t.sentiment.label} />
                    {t.tones.map((tag) => (
                      <Chip key={tag} color={TONE_COLOR[tag]}>
                        {tag}
                      </Chip>
                    ))}
                    <span className="ml-auto text-xs text-slate-400">
                      {t.date}
                    </span>
                  </div>
                  <div className="text-sm text-slate-800 whitespace-pre-wrap break-words">
                    {t.text}
                  </div>
                  <div className="mt-2 flex gap-4 text-xs text-slate-500 tabular-nums">
                    <span className="flex items-center gap-1">
                      <Heart className="w-3 h-3" /> {t.likes}
                    </span>
                    <span className="flex items-center gap-1">
                      <Repeat2 className="w-3 h-3" /> {t.retweets}
                    </span>
                    <span className="flex items-center gap-1">
                      <MessageSquare className="w-3 h-3" /> {t.replies}
                    </span>
                    {t.views > 0 && (
                      <span className="flex items-center gap-1">
                        <Eye className="w-3 h-3" /> {t.views}
                      </span>
                    )}
                    {t.url && (
                      <a
                        href={t.url}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="ml-auto text-indigo-600 hover:underline"
                      >
                        Open →
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </label>
          );
        })}
        {!filtered.length && (
          <div className="text-center py-12 text-slate-500">
            No tweets match these filters.
          </div>
        )}
      </div>
    </div>
  );
}
