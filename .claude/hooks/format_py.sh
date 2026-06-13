#!/usr/bin/env bash
# PostToolUse(Write|Edit): auto-format edited Python files with ruff.
# Prefers a ruff on PATH, falls back to the project venv, no-ops otherwise.
f=$(jq -r '.tool_input.file_path // .tool_response.filePath // empty' 2>/dev/null)
[ -n "${f:-}" ] || exit 0
[ "${f##*.}" = "py" ] || exit 0
if command -v ruff >/dev/null 2>&1; then
  ruff format "$f" >/dev/null 2>&1 || true
else
  for r in ./scraper/.venv/bin/ruff ./venv_tweet/bin/ruff ./scraper/venv*/bin/ruff; do
    if [ -x "$r" ]; then
      "$r" format "$f" >/dev/null 2>&1 || true
      break
    fi
  done
fi
exit 0
