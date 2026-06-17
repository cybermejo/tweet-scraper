#!/usr/bin/env python3
"""
X (Twitter) tweet scraper using pay-per-use pricing via twitterapi.io.

Why twitterapi.io?
    The official X API (api.x.com) is subscription-only (Basic / Pro / Enterprise).
    twitterapi.io is a third-party X data API that is true pay-per-use
    (~$0.15 per 1,000 tweets, no monthly fee). Sign up at https://twitterapi.io
    to get an API key.

Configuration: reads vars.json in the current directory by default. The schema
mirrors the Apify Tweet Scraper V2 input so the same vars.json works here.

Supported vars.json fields:
    searchTerms              list of keywords/phrases to search
    twitterHandles           list of @handles whose timelines to fetch
    startUrls                list of x.com/twitter.com profile URLs (handles are extracted)
    author                   restrict searches to tweets from this handle (adds `from:`)
    start                    ISO date "YYYY-MM-DD" — earliest tweet date (inclusive)
    end                      ISO date "YYYY-MM-DD" — latest tweet date (inclusive)
    maxItems                 max tweets per query (default 100)
    sort                     "Latest" or "Top"
    tweetLanguage            e.g. "en" (adds `lang:en`)
    onlyVerifiedUsers        adds filter:verified
    onlyTwitterBlue          adds filter:blue_verified
    onlyVideo                adds filter:videos
    onlyImage                adds filter:images
    onlyQuote                adds filter:quote
    includeSearchTerms       if true, the source term/handle is written to a column
    customMapFunction        (ignored — JS function, not applicable here)

Credit-saving notes:
    * `start` / `end` become `since:` / `until:` in search queries, so the API
      never returns (or charges for) tweets outside the window.
    * User-timeline endpoints don't support server-side date filters, but this
      script STOPS paging as soon as it sees tweets older than `start` — no
      wasted credits on ancient history.

Setup:
    pip install requests
    export TWITTERAPI_IO_KEY="your_key_here"

Usage:
    python tweet_scraper.py                          # reads ./vars.json, writes ./tweets.csv
    python tweet_scraper.py --config path/to.json
    python tweet_scraper.py --out results.csv
    python tweet_scraper.py --dry-run                # print built queries, don't call API
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import sys
import time
from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import requests

API_BASE = "https://api.twitterapi.io"
ADVANCED_SEARCH_URL = f"{API_BASE}/twitter/tweet/advanced_search"
USER_LAST_TWEETS_URL = f"{API_BASE}/twitter/user/last_tweets"
TWEET_REPLIES_URL = f"{API_BASE}/twitter/tweet/replies/v2"

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
            print(f"[warn] unknown config key '{key}' — ignored.", file=sys.stderr)
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


def handle_from_url(url: str) -> str | None:
    """Extract a handle from an x.com / twitter.com profile URL."""
    u = url.rstrip("/")
    for domain in ("x.com/", "twitter.com/"):
        if domain in u:
            tail = u.split(domain, 1)[1]
            handle = tail.split("/")[0].split("?")[0].lstrip("@")
            return handle or None
    return None


# ---------- query construction ---------------------------------------------


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


# ---------- HTTP ------------------------------------------------------------


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


# ---------- flatten & write ------------------------------------------------

CSV_COLUMNS = [
    "id",
    "url",
    "createdAt",
    "authorUsername",
    "authorName",
    "authorVerified",
    "authorIsBlueVerified",
    "text",
    "lang",
    "likeCount",
    "retweetCount",
    "replyCount",
    "quoteCount",
    "viewCount",
    "isRetweet",
    "isQuote",
    "isReply",
    "hasMedia",
    "mediaUrls",
    "sourceTerm",
    "parentTweetId",
]


def flatten(t: dict[str, Any], source_term: str = "", parent_id: str = "") -> dict[str, Any]:
    author = t.get("author")
    if not isinstance(author, dict):
        author = {}
    ext_raw = t.get("extendedEntities")
    ext: dict[str, Any] = ext_raw if isinstance(ext_raw, dict) else {}
    ent_raw = t.get("entities")
    ent: dict[str, Any] = ent_raw if isinstance(ent_raw, dict) else {}
    media_items = ext.get("media") or ent.get("media") or []
    if not isinstance(media_items, list):
        media_items = []
    media_urls: list[str] = []
    for m in media_items:
        if isinstance(m, dict):
            url = m.get("media_url_https") or m.get("media_url")
            if url:
                media_urls.append(str(url))
    handle = author.get("userName") or author.get("screen_name") or ""
    tid = str(t.get("id") or t.get("id_str") or "")
    return {
        "id": tid,
        "url": f"https://x.com/{handle}/status/{tid}" if handle and tid else t.get("url", ""),
        "createdAt": t.get("createdAt") or t.get("created_at", ""),
        "authorUsername": handle,
        "authorName": author.get("name", ""),
        "authorVerified": bool(author.get("verified", False)),
        "authorIsBlueVerified": bool(author.get("isBlueVerified", False)),
        "text": t.get("text") or t.get("full_text", ""),
        "lang": t.get("lang", ""),
        "likeCount": t.get("likeCount") or t.get("favorite_count", 0),
        "retweetCount": t.get("retweetCount") or t.get("retweet_count", 0),
        "replyCount": t.get("replyCount") or t.get("reply_count", 0),
        "quoteCount": t.get("quoteCount") or t.get("quote_count", 0),
        "viewCount": t.get("viewCount") or t.get("view_count", 0),
        "isRetweet": bool(t.get("isRetweet") or t.get("retweeted_status")),
        "isQuote": bool(t.get("isQuote") or t.get("quoted_status_id")),
        "isReply": bool(t.get("isReply") or t.get("in_reply_to_status_id")),
        "hasMedia": bool(media_urls),
        "mediaUrls": ";".join(media_urls),
        "sourceTerm": source_term,
        "parentTweetId": parent_id,
    }


def _write_new(writer: csv.DictWriter[str], seen: set[str], row: dict[str, Any]) -> bool:
    """Write a flattened row to the CSV if its id is new and non-empty.

    Returns True if the row was written. Streaming each row as it is fetched
    (instead of buffering everything until the end) means a mid-run failure
    still leaves the already-paid-for tweets on disk.
    """
    rid = row["id"]
    if rid and rid not in seen:
        seen.add(rid)
        writer.writerow(row)
        return True
    return False


def _stream_replies(
    writer: csv.DictWriter[str],
    seen: set[str],
    tweet_id: str,
    key: str,
    limit: int,
) -> int:
    """Fetch a tweet's replies and stream the new (unseen) ones to the CSV.

    Returns the number of reply rows written.
    """
    written = 0
    for reply in tweet_replies(tweet_id, key, limit):
        if _write_new(writer, seen, flatten(reply, parent_id=tweet_id)):
            written += 1
    return written


def _stream_query(
    writer: csv.DictWriter[str],
    seen: set[str],
    tweets: Iterator[dict[str, Any]],
    *,
    source_term: str,
    fetch_replies: bool,
    reply_targets: list[str],
) -> int:
    """Flatten, dedup, and stream a batch of tweets to the CSV.

    Each new tweet whose ``replyCount`` is positive has its id queued in
    ``reply_targets`` (when ``fetch_replies`` is set) for a later reply pass.
    Returns the number of new rows written.
    """
    count = 0
    for tw in tweets:
        row = flatten(tw, source_term=source_term)
        if _write_new(writer, seen, row):
            count += 1
            if fetch_replies and int(row.get("replyCount") or 0) > 0:
                reply_targets.append(row["id"])
    return count


# ---------- main ------------------------------------------------------------


def main() -> int:
    parser = argparse.ArgumentParser(description="X tweet scraper (twitterapi.io, pay-per-use)")
    parser.add_argument(
        "--config", default="vars.json", type=Path, help="Path to vars.json (default: ./vars.json)"
    )
    parser.add_argument(
        "--out", default="tweets.csv", type=Path, help="Output CSV path (default: ./tweets.csv)"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print the queries that would be issued; don't call the API",
    )
    args = parser.parse_args()

    if not args.config.exists():
        sys.exit(f"Config not found: {args.config}")

    cfg = load_config(args.config)
    max_items = int(cfg.get("maxItems") or 100)
    since_dt = parse_config_date(cfg.get("start"))
    until_dt = parse_config_date(cfg.get("end"), end_of_day=True)

    if cfg.get("customMapFunction"):
        print(
            "[warn] customMapFunction is a JS Apify feature — ignored in this script.",
            file=sys.stderr,
        )
    if since_dt and until_dt and since_dt > until_dt:
        sys.exit(f"Invalid range: start ({cfg['start']}) is after end ({cfg['end']}).")

    # Collect queries
    search_queries: list[tuple[str, str]] = []  # (source_term, query)
    for term in cfg.get("searchTerms") or []:
        search_queries.append((term, build_query(term, cfg)))

    handles: set[str] = {h.lstrip("@") for h in (cfg.get("twitterHandles") or []) if h}
    for u in cfg.get("startUrls") or []:
        h = handle_from_url(u)
        if h:
            handles.add(h)

    if args.dry_run:
        print(f"Config: {args.config}")
        print(f"Max items per query: {max_items}")
        print(f"Sort: {cfg.get('sort')}")
        print(f"Date range: {cfg.get('start') or '(any)'} -> {cfg.get('end') or '(any)'}")
        print("Search queries:")
        for term, q in search_queries:
            print(f"  [{term}] -> {q}")
        print("User timelines (date-filtered client-side, paging stops at `start`):")
        for h in sorted(handles):
            print(f"  @{h}")
        return 0

    key = get_api_key()
    seen: set[str] = set()
    reply_targets: list[str] = []  # ids of written tweets to fetch replies for
    total = 0
    fetch_replies = bool(cfg.get("fetchReplies"))
    include_terms = bool(cfg.get("includeSearchTerms"))

    args.out.parent.mkdir(parents=True, exist_ok=True)
    # Stream rows to the CSV as they arrive so a mid-run failure (network error,
    # rate-limit exhaustion, Ctrl-C) still leaves the already-paid-for tweets on
    # disk — the `with` block flushes and closes the file as the exception unwinds.
    with args.out.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=CSV_COLUMNS)
        writer.writeheader()

        for term, q in search_queries:
            print(f"[search] {q}", file=sys.stderr)
            count = _stream_query(
                writer,
                seen,
                search_tweets(q, cfg, key, max_items),
                source_term=term if include_terms else "",
                fetch_replies=fetch_replies,
                reply_targets=reply_targets,
            )
            total += count
            print(f"  -> {count} new tweets (total: {total})", file=sys.stderr)

        for h in sorted(handles):
            print(f"[user ] @{h}", file=sys.stderr)
            count = _stream_query(
                writer,
                seen,
                user_tweets(h, key, max_items, since=since_dt, until=until_dt),
                source_term=f"@{h}" if include_terms else "",
                fetch_replies=fetch_replies,
                reply_targets=reply_targets,
            )
            total += count
            print(f"  -> {count} new tweets (total: {total})", file=sys.stderr)

        if reply_targets:
            print(
                "[replies] fetching replies for tweets with replyCount > 0...",
                file=sys.stderr,
            )
            for tid in reply_targets:
                written = _stream_replies(writer, seen, tid, key, max_items)
                total += written
                if written:
                    print(
                        f"  [replies] tweet {tid} -> {written} replies (total: {total})",
                        file=sys.stderr,
                    )

    print(f"\nWrote {total} unique tweets -> {args.out}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
