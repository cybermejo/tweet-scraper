"""X (Twitter) tweet scraper using pay-per-use pricing via twitterapi.io.

Why twitterapi.io?
    The official X API (api.x.com) is subscription-only (Basic / Pro / Enterprise).
    twitterapi.io is a third-party X data API that is true pay-per-use
    (~$0.15 per 1,000 tweets, no monthly fee). Sign up at https://twitterapi.io
    to get an API key.

This package keeps a flat public API — ``from tweet_scraper import build_query``
still works — while the implementation is split across submodules:

    config  vars.json loading, validation, and date parsing
    query   search-query construction and handle extraction
    api     twitterapi.io HTTP client (auth, paging/retry, fetchers)
    cli     flatten → CSV, streaming writes, and the ``main`` entry point

Configuration mirrors the Apify Tweet Scraper V2 input so the same vars.json
works here. See README.md for setup, fields, and usage.
"""

from __future__ import annotations

from . import api, cli, config, query
from .api import (
    ADVANCED_SEARCH_URL,
    API_BASE,
    TWEET_REPLIES_URL,
    USER_LAST_TWEETS_URL,
    _extract_pagination,
    _extract_tweets,
    get_api_key,
    paged_get,
    search_tweets,
    tweet_replies,
    user_tweets,
)
from .cli import (
    CSV_COLUMNS,
    _stream_query,
    _stream_replies,
    _write_new,
    flatten,
    main,
)
from .config import (
    DEFAULTS,
    load_config,
    parse_config_date,
    tweet_created_at,
    validate_config,
)
from .query import build_query, handle_from_url

__all__ = [
    "ADVANCED_SEARCH_URL",
    "API_BASE",
    "CSV_COLUMNS",
    "DEFAULTS",
    "TWEET_REPLIES_URL",
    "USER_LAST_TWEETS_URL",
    "_extract_pagination",
    "_extract_tweets",
    "_stream_query",
    "_stream_replies",
    "_write_new",
    "api",
    "build_query",
    "cli",
    "config",
    "flatten",
    "get_api_key",
    "handle_from_url",
    "load_config",
    "main",
    "paged_get",
    "parse_config_date",
    "query",
    "search_tweets",
    "tweet_created_at",
    "tweet_replies",
    "user_tweets",
    "validate_config",
]
