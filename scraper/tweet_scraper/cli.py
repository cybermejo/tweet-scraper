"""Flatten tweets to CSV rows, stream them to disk, and orchestrate the CLI."""

from __future__ import annotations

import argparse
import csv
import logging
import sys
from collections.abc import Iterator
from pathlib import Path
from typing import Any

from . import api
from .config import load_config, parse_config_date
from .query import build_query, handle_from_url

log = logging.getLogger("tweet_scraper")


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
    for reply in api.tweet_replies(tweet_id, key, limit):
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

    # Progress/warnings go to stderr via logging; the dry-run report stays on
    # stdout (it is the program's actual output, not progress chatter).
    logging.basicConfig(level=logging.INFO, format="%(message)s", stream=sys.stderr)

    if not args.config.exists():
        sys.exit(f"Config not found: {args.config}")

    cfg = load_config(args.config)
    max_items = int(cfg.get("maxItems") or 100)
    since_dt = parse_config_date(cfg.get("start"))
    until_dt = parse_config_date(cfg.get("end"), end_of_day=True)

    if cfg.get("customMapFunction"):
        log.warning("customMapFunction is a JS Apify feature — ignored in this script.")
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

    key = api.get_api_key()
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
            log.info("[search] %s", q)
            count = _stream_query(
                writer,
                seen,
                api.search_tweets(q, cfg, key, max_items),
                source_term=term if include_terms else "",
                fetch_replies=fetch_replies,
                reply_targets=reply_targets,
            )
            total += count
            log.info("  -> %d new tweets (total: %d)", count, total)

        for h in sorted(handles):
            log.info("[user ] @%s", h)
            count = _stream_query(
                writer,
                seen,
                api.user_tweets(h, key, max_items, since=since_dt, until=until_dt),
                source_term=f"@{h}" if include_terms else "",
                fetch_replies=fetch_replies,
                reply_targets=reply_targets,
            )
            total += count
            log.info("  -> %d new tweets (total: %d)", count, total)

        if reply_targets:
            log.info("[replies] fetching replies for tweets with replyCount > 0...")
            for tid in reply_targets:
                written = _stream_replies(writer, seen, tid, key, max_items)
                total += written
                if written:
                    log.info("  [replies] tweet %s -> %d replies (total: %d)", tid, written, total)

    log.info("Wrote %d unique tweets -> %s", total, args.out)
    return 0
