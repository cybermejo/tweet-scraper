"""Config loading, validation, and date parsing for vars.json."""

from __future__ import annotations

import json
import logging
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

log = logging.getLogger("tweet_scraper")

DEFAULTS: dict[str, Any] = {
    "author": None,
    "customMapFunction": None,
    "end": None,
    "includeSearchTerms": False,
    "maxItems": 100,
    "onlyImage": False,
    "onlyQuote": False,
    "onlyTwitterBlue": False,
    "onlyVerifiedUsers": False,
    "onlyVideo": False,
    "searchTerms": [],
    "sort": "Latest",
    "start": None,
    "startUrls": [],
    "tweetLanguage": None,
    "twitterHandles": [],
    "fetchReplies": False,
}


# ---------- date helpers ----------------------------------------------------


def parse_config_date(s: str | None, *, end_of_day: bool = False) -> datetime | None:
    """Parse an ISO 'YYYY-MM-DD' from vars.json into a UTC datetime."""
    if not s:
        return None
    dt = datetime.strptime(s, "%Y-%m-%d").replace(tzinfo=UTC)
    if end_of_day:
        dt = dt.replace(hour=23, minute=59, second=59)
    return dt


_TWEET_TIME_FORMATS = (
    "%a %b %d %H:%M:%S %z %Y",  # Twitter classic: "Thu Apr 17 14:30:00 +0000 2026"
    "%Y-%m-%dT%H:%M:%S.%fZ",
    "%Y-%m-%dT%H:%M:%SZ",
)


def tweet_created_at(t: dict[str, Any]) -> datetime | None:
    s = t.get("createdAt") or t.get("created_at")
    if not s:
        return None
    for fmt in _TWEET_TIME_FORMATS:
        try:
            return datetime.strptime(s, fmt).astimezone(UTC)
        except ValueError:
            continue
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00")).astimezone(UTC)
    except ValueError:
        return None


# ---------- config ----------------------------------------------------------


# Accepted types per known config key. `type(None)` marks a nullable field.
# bool is intentionally allowed for maxItems too (it is an int subclass) — not
# worth special-casing for a config validator.
_CONFIG_TYPES: dict[str, tuple[type, ...]] = {
    "author": (str, type(None)),
    "customMapFunction": (str, type(None)),
    "end": (str, type(None)),
    "fetchReplies": (bool,),
    "includeSearchTerms": (bool,),
    "maxItems": (int, float),
    "onlyImage": (bool,),
    "onlyQuote": (bool,),
    "onlyTwitterBlue": (bool,),
    "onlyVerifiedUsers": (bool,),
    "onlyVideo": (bool,),
    "searchTerms": (list,),
    "sort": (str,),
    "start": (str, type(None)),
    "startUrls": (list,),
    "tweetLanguage": (str, type(None)),
    "twitterHandles": (list,),
}


def validate_config(cfg: dict[str, Any]) -> None:
    """Warn on unknown keys and reject known keys with the wrong type.

    Unknown keys only warn: the config schema mirrors the Apify Tweet Scraper V2
    input (a superset of what this script implements), so an existing Apify
    vars.json must still load. A type mismatch on a known key is a hard error
    because it would otherwise crash or misbehave deep in the run.
    """
    for key in cfg:
        if key not in _CONFIG_TYPES:
            log.warning("unknown config key '%s' — ignored.", key)
    for key, types in _CONFIG_TYPES.items():
        if key in cfg and not isinstance(cfg[key], types):
            expected = " or ".join(t.__name__ for t in types)
            got = type(cfg[key]).__name__
            sys.exit(f"Config error: '{key}' must be {expected}, got {got}.")


def load_config(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as f:
        cfg = json.load(f)
    if not isinstance(cfg, dict):
        sys.exit("Config error: the top-level JSON in the config file must be an object.")
    validate_config(cfg)
    return {**DEFAULTS, **cfg}
