import { useMemo } from "react";
import {
  BarChart3,
  Hash,
  MessageSquare,
  TrendingUp,
  Heart,
  Repeat2,
} from "lucide-react";
import { Stat, Bar, Chip, SentimentChip } from "./primitives.jsx";
import { TONE_COLOR } from "../lib/lexicons.js";
import { overviewStats } from "../lib/stats.js";

/* ============================================================
 * OVERVIEW TAB
 * ============================================================ */

export function OverviewTab({ tweets }) {
  const {
    total,
    byLabel,
    toneSorted,
    avgLen,
    avgEmoji,
    top,
    totalLikes,
    totalRts,
  } = useMemo(() => overviewStats(tweets), [tweets]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat
          icon={MessageSquare}
          label="Tweets"
          value={total.toLocaleString()}
          tone="sky"
        />
        <Stat
          icon={Heart}
          label="Total Likes"
          value={totalLikes.toLocaleString()}
          tone="rose"
        />
        <Stat
          icon={Repeat2}
          label="Total Retweets"
          value={totalRts.toLocaleString()}
          tone="green"
        />
        <Stat
          icon={TrendingUp}
          label="Avg Tweet Length"
          value={avgLen}
          sub={`${avgEmoji} emoji/tweet avg`}
          tone="amber"
        />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="w-4 h-4 text-slate-500" />
            <h3 className="font-semibold text-slate-900">
              Sentiment Distribution
            </h3>
          </div>
          <div className="space-y-3">
            <Bar
              label="Positive"
              value={byLabel.positive}
              total={total}
              color="bg-green-500"
            />
            <Bar
              label="Neutral"
              value={byLabel.neutral}
              total={total}
              color="bg-slate-400"
            />
            <Bar
              label="Negative"
              value={byLabel.negative}
              total={total}
              color="bg-rose-500"
            />
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Hash className="w-4 h-4 text-slate-500" />
            <h3 className="font-semibold text-slate-900">Tone Mix</h3>
          </div>
          <div className="space-y-2">
            {toneSorted.slice(0, 8).map(([tag, count]) => (
              <Bar
                key={tag}
                label={tag}
                value={count}
                total={total}
                color="bg-indigo-500"
              />
            ))}
            {!toneSorted.length && (
              <div className="text-sm text-slate-500">
                No tone patterns detected.
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
        <h3 className="font-semibold text-slate-900 mb-4">Top performers</h3>
        <div className="space-y-3">
          {top.map((t) => (
            <div
              key={t.id || t.text.slice(0, 20)}
              className="flex gap-3 p-3 border border-slate-100 rounded-lg"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-medium text-slate-900">
                    @{t.author || "unknown"}
                  </span>
                  {t.brand && <Chip>{t.brand}</Chip>}
                  <SentimentChip label={t.sentiment.label} />
                  {t.tones.slice(0, 2).map((tag) => (
                    <Chip key={tag} color={TONE_COLOR[tag]}>
                      {tag}
                    </Chip>
                  ))}
                </div>
                <div className="text-sm text-slate-700 line-clamp-3">
                  {t.text}
                </div>
              </div>
              <div className="flex flex-col items-end gap-1 text-xs text-slate-500 tabular-nums">
                <span className="flex items-center gap-1">
                  <Heart className="w-3 h-3" /> {t.likes}
                </span>
                <span className="flex items-center gap-1">
                  <Repeat2 className="w-3 h-3" /> {t.retweets}
                </span>
                <span className="flex items-center gap-1">
                  <MessageSquare className="w-3 h-3" /> {t.replies}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
