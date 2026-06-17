/* ============================================================
 * DISPLAY HELPERS
 * ============================================================ */

// The Tweets tab renders at most this many rows for performance. The cap was
// previously applied silently; capNotice surfaces it so users don't think
// matches are missing.
export const MAX_VISIBLE = 500;

export function capNotice(matchCount, cap = MAX_VISIBLE) {
  if (matchCount <= cap) return null;
  return `Showing the top ${cap} of ${matchCount.toLocaleString()} matches`;
}
