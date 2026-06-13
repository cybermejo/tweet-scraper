#!/usr/bin/env bash
# PreToolUse(Write|Edit): refuse to write secrets or scraped tweet data.
# vars.json is intentionally NOT blocked — it is git-ignored local config you
# may legitimately edit; committing it is already prevented by .gitignore and
# the pre-commit guard.
f=$(jq -r '.tool_input.file_path // empty' 2>/dev/null)
[ -n "${f:-}" ] || exit 0
base=$(basename "$f")

deny() {
  printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"%s"}}\n' "$1"
  exit 0
}

case "$base" in
  tweets.sample.csv) ;;  # the one committed, anonymized CSV is allowed
  tweets*.csv)
    deny "Blocked write to $base: scraped tweet data is third-party PII. The scraper writes its own CSV output; do not hand-write or commit it (see .gitignore)." ;;
  .env | .env.*)
    deny "Blocked write to $base: secret/env file must never be written or committed." ;;
esac
exit 0
