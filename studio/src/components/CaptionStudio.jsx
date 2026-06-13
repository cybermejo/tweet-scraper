import { useState, useMemo } from "react";
import { Wand2, Sparkles, Copy, Check, X } from "lucide-react";
import { CAPTION_TONES } from "../lib/lexicons.js";

/* ============================================================
 * CAPTION STUDIO
 * ============================================================ */

export function CaptionStudio({ tweets, selection, onGoToTweets }) {
  const brands = useMemo(() => {
    const s = new Set(tweets.map((t) => t.brand).filter(Boolean));
    return Array.from(s).sort();
  }, [tweets]);

  // 'auto' = top N of brand by engagement; 'manual' = user-selected from Tweets tab
  const [sourceMode, setSourceMode] = useState("auto");
  const [brand, setBrand] = useState(brands[0] || "");
  const [topic, setTopic] = useState("");
  const [tone, setTone] = useState("Playful");
  const [count, setCount] = useState(5);
  const [length, setLength] = useState("twitter"); // twitter (280) | short (≤120) | thread-starter
  const [copied, setCopied] = useState(false);

  // If the user navigates here with tweets already selected, auto-preselect
  // manual mode. This uses the React-canonical "adjusting state during render"
  // pattern — a no-op when selectionSize is stable, flips once on the edge.
  const selectionSize = selection?.count ?? 0;
  const [prevSelectionSize, setPrevSelectionSize] = useState(0);
  if (prevSelectionSize !== selectionSize) {
    setPrevSelectionSize(selectionSize);
    if (selectionSize > 0 && prevSelectionSize === 0 && sourceMode === "auto") {
      setSourceMode("manual");
    }
  }

  const selectedTweets = useMemo(
    () => (selection ? tweets.filter((t) => selection.has(t.uid)) : []),
    [tweets, selection],
  );

  const brandTweets = useMemo(
    () => (brand ? tweets.filter((t) => t.brand === brand) : tweets),
    [brand, tweets],
  );

  // What we actually use to derive style + examples
  const referenceTweets =
    sourceMode === "manual" ? selectedTweets : brandTweets;

  const stats = useMemo(() => {
    if (!referenceTweets.length) return null;
    const lens = referenceTweets.map((t) => t.length);
    const emo = referenceTweets.map((t) => t.emoji);
    const hash = referenceTweets.map((t) => t.hashtags);
    const tones = {};
    for (const t of referenceTweets)
      for (const tag of t.tones) tones[tag] = (tones[tag] || 0) + 1;
    const topTones = Object.entries(tones)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([t]) => t);
    return {
      avgLen: Math.round(lens.reduce((a, b) => a + b, 0) / lens.length),
      avgEmoji: (emo.reduce((a, b) => a + b, 0) / emo.length).toFixed(1),
      avgHash: (hash.reduce((a, b) => a + b, 0) / hash.length).toFixed(1),
      topTones,
    };
  }, [referenceTweets]);

  // Examples: in auto mode take top-8 by engagement; in manual mode use up to 12
  // of the user's picks as-is (ordered by engagement for consistency).
  const topExamples = useMemo(() => {
    if (sourceMode === "manual") {
      return [...referenceTweets]
        .sort((a, b) => b.engagement - a.engagement)
        .slice(0, 12);
    }
    return [...referenceTweets]
      .sort((a, b) => b.engagement - a.engagement)
      .slice(0, 8);
  }, [referenceTweets, sourceMode]);

  const prompt = useMemo(() => {
    if (!topExamples.length) return "";
    const lenGuide = {
      twitter: "Keep each caption under 280 characters.",
      short: "Keep each caption short — under 120 characters, punchy.",
      thread:
        "Write each as a thread-opener (hook tweet) under 280 chars; it should invite a follow-up.",
    }[length];

    const examples = topExamples
      .map(
        (t, i) =>
          `${i + 1}. (${t.likes} likes, ${t.retweets} RTs) "${t.text.replace(/\s+/g, " ").trim()}"`,
      )
      .join("\n");

    const voiceLabel =
      sourceMode === "manual"
        ? `the voice of these ${topExamples.length} hand-picked reference tweets`
        : `the voice of the brand "${brand || "this account"}"`;

    const refHeader =
      sourceMode === "manual"
        ? "Style reference — these are the tweets I personally selected as my voice reference:"
        : "Style reference — here are the top-performing tweets from this brand (by engagement):";

    return `You're helping me write captions in ${voiceLabel}.

${refHeader}
${examples}

Observed style signals:
- Average tweet length: ~${stats.avgLen} characters
- Average emoji per tweet: ${stats.avgEmoji}
- Average hashtags per tweet: ${stats.avgHash}
- Dominant tones: ${stats.topTones.join(", ") || "varied"}

Task:
Write ${count} caption options for a new tweet about: "${topic || "[TOPIC GOES HERE]"}".

Constraints:
- Match the voice you see in the examples (vocabulary, rhythm, emoji usage, hashtag habits).
- Target tone for these specific captions: ${tone}.
- ${lenGuide}
- Number each option. Keep them distinct — vary the angle, hook, and opener.
- No hashtag dumps — use hashtags only if the examples suggest it.
- Don't use em-dashes or corporate-speak unless the examples do.`;
  }, [sourceMode, brand, topic, tone, count, length, topExamples, stats]);

  const copy = async () => {
    if (!prompt) return;
    await navigator.clipboard.writeText(prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="grid lg:grid-cols-5 gap-6">
      <div className="lg:col-span-2 space-y-4">
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
          <div className="flex items-center gap-2">
            <Wand2 className="w-4 h-4 text-indigo-600" />
            <h3 className="font-semibold text-slate-900">Caption Studio</h3>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 uppercase tracking-wide mb-1">
              Style reference
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setSourceMode("auto")}
                className={`p-2.5 rounded-lg border text-left text-xs transition ${sourceMode === "auto" ? "border-indigo-500 bg-indigo-50" : "border-slate-200 hover:border-slate-300"}`}
              >
                <div className="font-semibold text-slate-900">Auto</div>
                <div className="text-slate-500">
                  Top tweets from the selected brand
                </div>
              </button>
              <button
                onClick={() => setSourceMode("manual")}
                className={`p-2.5 rounded-lg border text-left text-xs transition ${sourceMode === "manual" ? "border-indigo-500 bg-indigo-50" : "border-slate-200 hover:border-slate-300"}`}
              >
                <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                  Manual
                  {selectionSize > 0 && (
                    <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-indigo-600 text-white text-[10px] font-semibold tabular-nums">
                      {selectionSize}
                    </span>
                  )}
                </div>
                <div className="text-slate-500">
                  Tweets you picked on the Tweets tab
                </div>
              </button>
            </div>
          </div>

          {sourceMode === "auto" && (
            <div>
              <label className="block text-xs font-medium text-slate-700 uppercase tracking-wide mb-1">
                Brand
              </label>
              <select
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
              >
                <option value="">(All brands — general voice)</option>
                {brands.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </div>
          )}

          {sourceMode === "manual" && (
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-medium text-slate-700 uppercase tracking-wide">
                  {selectionSize} selected tweet{selectionSize === 1 ? "" : "s"}
                </div>
                <button
                  onClick={onGoToTweets}
                  className="text-xs font-medium text-indigo-700 hover:text-indigo-900"
                >
                  {selectionSize === 0 ? "Pick tweets →" : "Edit selection →"}
                </button>
              </div>
              {selectionSize === 0 ? (
                <div className="text-xs text-slate-500">
                  Go to the Tweets tab, check off the ones you want Claude to
                  learn from, then come back here.
                </div>
              ) : (
                <div className="space-y-1.5 max-h-48 overflow-auto">
                  {selectedTweets.slice(0, 20).map((t) => (
                    <div key={t.uid} className="flex items-start gap-2 text-xs">
                      <button
                        onClick={() => selection.toggle(t.uid)}
                        className="mt-0.5 text-slate-400 hover:text-rose-600 shrink-0"
                        title="Remove from selection"
                      >
                        <X className="w-3 h-3" />
                      </button>
                      <div className="flex-1 min-w-0 text-slate-700 truncate">
                        {t.brand && (
                          <span className="text-slate-400 mr-1">
                            [{t.brand}]
                          </span>
                        )}
                        {t.text}
                      </div>
                    </div>
                  ))}
                  {selectedTweets.length > 20 && (
                    <div className="text-[11px] text-slate-500 pt-1">
                      + {selectedTweets.length - 20} more…
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-700 uppercase tracking-wide mb-1">
              Topic / Idea
            </label>
            <textarea
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              rows={3}
              placeholder="e.g., launch of our new pastel lipstick, teasing a Gwenuhit drop, thanking fans for 10k followers..."
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 uppercase tracking-wide mb-1">
                Tone
              </label>
              <select
                value={tone}
                onChange={(e) => setTone(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
              >
                {CAPTION_TONES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 uppercase tracking-wide mb-1">
                How Many
              </label>
              <select
                value={count}
                onChange={(e) => setCount(parseInt(e.target.value))}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
              >
                {[3, 5, 8, 10].map((n) => (
                  <option key={n} value={n}>
                    {n} options
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 uppercase tracking-wide mb-1">
              Format
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                ["twitter", "Standard", "≤280 chars"],
                ["short", "Short", "≤120 chars"],
                ["thread", "Thread Hook", "Opener"],
              ].map(([v, label, sub]) => (
                <button
                  key={v}
                  onClick={() => setLength(v)}
                  className={`p-2 rounded-lg border text-xs text-left transition ${length === v ? "border-indigo-500 bg-indigo-50" : "border-slate-200 hover:border-slate-300"}`}
                >
                  <div className="font-medium text-slate-900">{label}</div>
                  <div className="text-slate-500">{sub}</div>
                </button>
              ))}
            </div>
          </div>

          {stats && (
            <div className="pt-3 border-t border-slate-100 text-xs text-slate-600 space-y-1">
              <div className="font-medium text-slate-700 mb-1">
                Style signals detected from{" "}
                {sourceMode === "manual"
                  ? `${referenceTweets.length} selected tweet${referenceTweets.length === 1 ? "" : "s"}`
                  : `${brand || "all brands"} (${referenceTweets.length} tweets)`}
                :
              </div>
              <div>
                • Avg length ~{stats.avgLen} chars · {stats.avgEmoji} emoji ·{" "}
                {stats.avgHash} hashtags
              </div>
              <div>• Dominant tones: {stats.topTones.join(", ") || "—"}</div>
            </div>
          )}
        </div>
      </div>

      <div className="lg:col-span-3">
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-600" />
              <h3 className="font-semibold text-slate-900">
                Prompt to paste into Claude
              </h3>
            </div>
            <button
              onClick={copy}
              disabled={!prompt}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4" /> Copied
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" /> Copy
                </>
              )}
            </button>
          </div>
          {!prompt && (
            <div className="text-sm text-slate-500 py-8 text-center">
              {topExamples.length
                ? "Enter a topic to build a prompt."
                : sourceMode === "manual"
                  ? "Select some tweets on the Tweets tab to use as your style reference."
                  : "No tweets available for the selected brand."}
            </div>
          )}
          {prompt && (
            <pre className="text-xs bg-slate-50 border border-slate-200 rounded-lg p-4 whitespace-pre-wrap font-mono text-slate-800 max-h-[600px] overflow-auto">
              {prompt}
            </pre>
          )}
          <div className="mt-3 text-xs text-slate-500">
            Paste this into any Claude chat (including this Cowork session).
            Claude will respond with {count} on-brand caption variations you can
            iterate on.
          </div>
        </div>
      </div>
    </div>
  );
}
