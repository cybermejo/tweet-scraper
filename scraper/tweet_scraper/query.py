"""Search-query construction and handle extraction."""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any


def handle_from_url(url: str) -> str | None:
    """Extract a handle from an x.com / twitter.com profile URL."""
    u = url.rstrip("/")
    for domain in ("x.com/", "twitter.com/"):
        if domain in u:
            tail = u.split(domain, 1)[1]
            handle = tail.split("/")[0].split("?")[0].lstrip("@")
            return handle or None
    return None


def build_query(term: str, cfg: dict[str, Any]) -> str:
    parts: list[str] = []
    if term:
        # Multi-word terms become exact-phrase; single tokens stay bare
        parts.append(f'"{term}"' if " " in term else term)
    if cfg.get("author"):
        parts.append(f"from:{str(cfg['author']).lstrip('@')}")
    if cfg.get("tweetLanguage"):
        parts.append(f"lang:{cfg['tweetLanguage']}")
    if cfg.get("onlyVerifiedUsers"):
        parts.append("filter:verified")
    if cfg.get("onlyTwitterBlue"):
        parts.append("filter:blue_verified")
    if cfg.get("onlyVideo"):
        parts.append("filter:videos")
    if cfg.get("onlyImage"):
        parts.append("filter:images")
    if cfg.get("onlyQuote"):
        parts.append("filter:quote")
    # Date range — server-side filtering saves credits.
    # Twitter's `until:` is exclusive of that day, so add one day to make
    # the user's `end` inclusive.
    if cfg.get("start"):
        parts.append(f"since:{cfg['start']}")
    if cfg.get("end"):
        try:
            end_plus = datetime.strptime(cfg["end"], "%Y-%m-%d") + timedelta(days=1)
            parts.append(f"until:{end_plus.strftime('%Y-%m-%d')}")
        except ValueError:
            parts.append(f"until:{cfg['end']}")
    return " ".join(parts)
