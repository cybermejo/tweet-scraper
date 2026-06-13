"""Query construction and URL parsing — the bits most likely to silently
produce wrong (and credit-wasting) API calls."""

from tweet_scraper import build_query, handle_from_url


def test_single_token_is_bare():
    assert build_query("figurine", {}) == "figurine"


def test_multi_word_term_becomes_exact_phrase():
    assert build_query("art workshop", {}) == '"art workshop"'


def test_empty_term_is_skipped():
    assert build_query("", {"author": "Bob"}) == "from:Bob"


def test_author_strips_leading_at():
    assert build_query("x", {"author": "@Bob"}) == "x from:Bob"


def test_language_filter():
    assert build_query("x", {"tweetLanguage": "en"}) == "x lang:en"


def test_boolean_filters_render_in_order():
    q = build_query("x", {"onlyVerifiedUsers": True, "onlyVideo": True})
    assert q == "x filter:verified filter:videos"


def test_start_becomes_since():
    assert build_query("x", {"start": "2025-01-01"}) == "x since:2025-01-01"


def test_end_is_inclusive_and_adds_one_day():
    # Twitter's `until:` is exclusive, so end=2025-12-31 must become until:2026-01-01.
    assert build_query("x", {"end": "2025-12-31"}) == "x until:2026-01-01"


def test_malformed_end_is_passed_through():
    assert build_query("x", {"end": "not-a-date"}) == "x until:not-a-date"


def test_handle_from_plain_x_url():
    assert handle_from_url("https://x.com/LuminaryStudPH") == "LuminaryStudPH"


def test_handle_from_twitter_status_url():
    assert handle_from_url("https://twitter.com/Foo/status/123") == "Foo"


def test_handle_strips_at_and_query_string():
    assert handle_from_url("https://x.com/@Bar?ref=home") == "Bar"


def test_handle_tolerates_trailing_slash():
    assert handle_from_url("https://x.com/Baz/") == "Baz"


def test_handle_returns_none_for_non_profile_url():
    assert handle_from_url("https://example.com/whatever") is None
