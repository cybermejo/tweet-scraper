"""twitterapi.io HTTP client: auth, paging/retry, and the per-endpoint fetchers."""

from __future__ import annotations

import os
import sys
import time
from collections.abc import Iterator
from datetime import datetime
from typing import Any

import requests

from .config import tweet_created_at

API_BASE = "https://api.twitterapi.io"
ADVANCED_SEARCH_URL = f"{API_BASE}/twitter/tweet/advanced_search"
USER_LAST_TWEETS_URL = f"{API_BASE}/twitter/user/last_tweets"
TWEET_REPLIES_URL = f"{API_BASE}/twitter/tweet/replies/v2"


def get_api_key() -> str:
    key = os.environ.get("TWITTERAPI_IO_KEY") or os.environ.get("TWITTERAPI_KEY")
    if not key:
        sys.exit(
            "Missing API key. Set TWITTERAPI_IO_KEY in your environment.\n"
            "Get one at https://twitterapi.io (pay-per-use, no subscription)."
        )
    return key


def _extract_tweets(data: dict[str, Any]) -> list[dict[str, Any]]:
    """Pull the tweet list out of a twitterapi.io response regardless of shape.

    Shapes observed:
      advanced_search:  {"tweets": [...], "has_next_page": ..., "next_cursor": ...}
      user/last_tweets: {"data": {"tweets": [...], "pin_tweet": {...}}, ...}
    """
    t = data.get("tweets")
    if isinstance(t, list):
        return [x for x in t if isinstance(x, dict)]
    inner = data.get("data")
    if isinstance(inner, dict):
        t = inner.get("tweets")
        if isinstance(t, list):
            return [x for x in t if isinstance(x, dict)]
    if isinstance(inner, list):
        return [x for x in inner if isinstance(x, dict)]
    return []


def _extract_pagination(data: dict[str, Any]) -> tuple[bool, str]:
    """Return (has_next_page, next_cursor), checking both top-level and nested data."""
    has_next = data.get("has_next_page")
    cursor = data.get("next_cursor")
    inner = data.get("data")
    if isinstance(inner, dict):
        if has_next is None:
            has_next = inner.get("has_next_page")
        if not cursor:
            cursor = inner.get("next_cursor")
    return bool(has_next), cursor or ""


def paged_get(
    url: str,
    params: dict[str, Any],
    api_key: str,
    limit: int,
    max_retries: int = 3,
) -> Iterator[dict[str, Any]]:
    headers = {"X-API-Key": api_key}
    cursor = ""
    yielded = 0
    while yielded < limit:
        p = {**params}
        if cursor:
            p["cursor"] = cursor

        attempt = 0
        while True:
            try:
                resp = requests.get(url, headers=headers, params=p, timeout=60)
            except requests.RequestException:
                if attempt >= max_retries:
                    raise
                time.sleep(1.5**attempt)
                attempt += 1
                continue
            if resp.status_code == 429:
                time.sleep(2 + attempt)
                attempt += 1
                if attempt > max_retries:
                    resp.raise_for_status()
                continue
            if resp.status_code >= 500 and attempt < max_retries:
                time.sleep(1.5**attempt)
                attempt += 1
                continue
            resp.raise_for_status()
            break

        data = resp.json()
        tweets = _extract_tweets(data)
        if not tweets:
            return
        for t in tweets:
            if yielded >= limit:
                return
            yield t
            yielded += 1
        has_next, cursor = _extract_pagination(data)
        if not has_next or not cursor:
            return


def search_tweets(
    query: str, cfg: dict[str, Any], key: str, limit: int
) -> Iterator[dict[str, Any]]:
    sort_val = str(cfg.get("sort", "Latest")).lower()
    query_type = "Latest" if sort_val.startswith("latest") else "Top"
    yield from paged_get(
        ADVANCED_SEARCH_URL,
        {"query": query, "queryType": query_type},
        key,
        limit,
    )


def user_tweets(
    handle: str,
    key: str,
    limit: int,
    since: datetime | None = None,
    until: datetime | None = None,
) -> Iterator[dict[str, Any]]:
    """Yield a user's tweets, filtering by date range if supplied.

    The user-timeline endpoint has no server-side date filter, so we:
      * skip tweets newer than `until` (rare — only if user backdates),
      * stop paging completely once we see a tweet older than `since`,
        which saves credits on paginating through ancient history.
    Timelines are delivered newest-first, so the first tweet older than
    `since` means everything after it is also older.
    """
    for t in paged_get(
        USER_LAST_TWEETS_URL,
        {"userName": handle.lstrip("@")},
        key,
        limit,
    ):
        tw_dt = tweet_created_at(t)
        if tw_dt is None:
            # Date-less tweet: yield it rather than drop silently.
            yield t
            continue
        if until is not None and tw_dt > until:
            # Too new — skip but keep scanning (pinned tweets, etc.).
            continue
        if since is not None and tw_dt < since:
            # Older than our window; remaining tweets will be even older.
            break
        yield t


def tweet_replies(tweet_id: str, key: str, limit: int) -> Iterator[dict[str, Any]]:
    yield from paged_get(
        TWEET_REPLIES_URL,
        {"tweetId": tweet_id},
        key,
        limit,
    )
