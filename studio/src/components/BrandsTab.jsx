import { useMemo } from "react";
import { Heart, Repeat2, MessageSquare } from "lucide-react";
import { Chip } from "./primitives.jsx";
import { TONE_COLOR } from "../lib/lexicons.js";

/* ============================================================
 * BRANDS TAB
 * ============================================================ */

export function BrandsTab({ tweets }) {
  const brandRows = useMemo(() => {
    const groups = {};
    for (const t of tweets) {
      const key = t.brand || "(unlabeled)";
      if (!groups[key]) groups[key] = [];
      groups[key].push(t);
    }
    return Object.entries(groups)
      .map(([brand, list]) => {
        const sent = { positive: 0, neutral: 0, negative: 0 };
        let likes = 0,
          rts = 0,
          replies = 0;
        const toneCount = {};
        for (const t of list) {
          sent[t.sentiment.label]++;
          likes += t.likes;
          rts += t.retweets;
          replies += t.replies;
          for (const tag of t.tones) toneCount[tag] = (toneCount[tag] || 0) + 1;
        }
        const topTones = Object.entries(toneCount)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([t]) => t);
        return {
          brand,
          count: list.length,
          sent,
          likes,
          rts,
          replies,
          topTones,
        };
      })
      .sort((a, b) => b.count - a.count);
  }, [tweets]);

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 border-b border-slate-200">
          <tr className="text-left text-xs uppercase tracking-wide text-slate-600">
            <th className="px-4 py-3">Brand</th>
            <th className="px-4 py-3">Tweets</th>
            <th className="px-4 py-3">Sentiment</th>
            <th className="px-4 py-3">Engagement</th>
            <th className="px-4 py-3">Dominant Tones</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {brandRows.map((r) => (
            <tr key={r.brand} className="hover:bg-slate-50">
              <td className="px-4 py-3 font-medium text-slate-900">
                {r.brand}
              </td>
              <td className="px-4 py-3 text-slate-700 tabular-nums">
                {r.count}
              </td>
              <td className="px-4 py-3">
                <div className="flex gap-1">
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-green-100 text-green-800 text-xs tabular-nums">
                    +{r.sent.positive}
                  </span>
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 text-xs tabular-nums">
                    ·{r.sent.neutral}
                  </span>
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 text-xs tabular-nums">
                    −{r.sent.negative}
                  </span>
                </div>
              </td>
              <td className="px-4 py-3 text-xs text-slate-600 tabular-nums">
                <div className="flex gap-3">
                  <span className="flex items-center gap-1">
                    <Heart className="w-3 h-3" /> {r.likes}
                  </span>
                  <span className="flex items-center gap-1">
                    <Repeat2 className="w-3 h-3" /> {r.rts}
                  </span>
                  <span className="flex items-center gap-1">
                    <MessageSquare className="w-3 h-3" /> {r.replies}
                  </span>
                </div>
              </td>
              <td className="px-4 py-3">
                <div className="flex gap-1 flex-wrap">
                  {r.topTones.map((t) => (
                    <Chip key={t} color={TONE_COLOR[t]}>
                      {t}
                    </Chip>
                  ))}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
