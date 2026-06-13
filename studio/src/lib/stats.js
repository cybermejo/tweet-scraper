/* ============================================================
 * OVERVIEW STATS
 * ============================================================ */

// Aggregate the dashboard metrics for the Overview tab. Pure and
// framework-free so the component can memoize it and it can be unit-tested
// directly. Logic moved verbatim out of OverviewTab.
export function overviewStats(tweets) {
  const total = tweets.length;
  const byLabel = { positive: 0, neutral: 0, negative: 0 };
  const toneCounts = {};
  let totalLikes = 0,
    totalRts = 0,
    totalReplies = 0,
    totalLen = 0,
    totalEmoji = 0,
    totalHashtags = 0;
  for (const t of tweets) {
    byLabel[t.sentiment.label]++;
    for (const tag of t.tones) toneCounts[tag] = (toneCounts[tag] || 0) + 1;
    totalLikes += t.likes;
    totalRts += t.retweets;
    totalReplies += t.replies;
    totalLen += t.length;
    totalEmoji += t.emoji;
    totalHashtags += t.hashtags;
  }
  const toneSorted = Object.entries(toneCounts).sort((a, b) => b[1] - a[1]);
  const avgLen = total ? Math.round(totalLen / total) : 0;
  const avgEmoji = total ? (totalEmoji / total).toFixed(1) : 0;
  const top = [...tweets]
    .sort((a, b) => b.engagement - a.engagement)
    .slice(0, 5);
  return {
    total,
    byLabel,
    toneCounts,
    totalLikes,
    totalRts,
    totalReplies,
    totalLen,
    totalEmoji,
    totalHashtags,
    toneSorted,
    avgLen,
    avgEmoji,
    top,
  };
}
