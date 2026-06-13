"""The paging/retry engine (`paged_get`) and response-shape helpers.

These are pure-logic against mocked HTTP, so no network or API key is used.
"""

from unittest.mock import patch

import pytest
import requests

from tweet_scraper import (
    _extract_pagination,
    _extract_tweets,
    flatten,
    paged_get,
)


class FakeResp:
    def __init__(self, status_code, payload):
        self.status_code = status_code
        self._payload = payload

    def json(self):
        return self._payload

    def raise_for_status(self):
        if self.status_code >= 400:
            raise requests.HTTPError(f"status {self.status_code}")


# ---------- response-shape helpers ----------


def test_extract_tweets_top_level_list():
    assert _extract_tweets({"tweets": [{"id": "1"}, {"id": "2"}]}) == [{"id": "1"}, {"id": "2"}]


def test_extract_tweets_nested_under_data():
    data = {"data": {"tweets": [{"id": "9"}]}}
    assert _extract_tweets(data) == [{"id": "9"}]


def test_extract_tweets_drops_non_dicts():
    assert _extract_tweets({"tweets": [{"id": "1"}, "junk", None]}) == [{"id": "1"}]


def test_extract_pagination_top_level():
    assert _extract_pagination({"has_next_page": True, "next_cursor": "c1"}) == (True, "c1")


def test_extract_pagination_nested_under_data():
    data = {"data": {"has_next_page": True, "next_cursor": "c2"}}
    assert _extract_pagination(data) == (True, "c2")


def test_extract_pagination_missing_is_false_empty():
    assert _extract_pagination({}) == (False, "")


# ---------- paged_get ----------


def test_paged_get_single_page():
    resp = FakeResp(200, {"tweets": [{"id": "1"}, {"id": "2"}], "has_next_page": False})
    with patch("tweet_scraper.requests.get", return_value=resp):
        out = list(paged_get("http://x", {}, "key", limit=10))
    assert [t["id"] for t in out] == ["1", "2"]


def test_paged_get_respects_limit():
    resp = FakeResp(
        200, {"tweets": [{"id": "1"}, {"id": "2"}, {"id": "3"}], "has_next_page": False}
    )
    with patch("tweet_scraper.requests.get", return_value=resp):
        out = list(paged_get("http://x", {}, "key", limit=2))
    assert [t["id"] for t in out] == ["1", "2"]


def test_paged_get_follows_cursor_across_pages():
    page1 = FakeResp(200, {"tweets": [{"id": "1"}], "has_next_page": True, "next_cursor": "c1"})
    page2 = FakeResp(200, {"tweets": [{"id": "2"}], "has_next_page": False})
    with patch("tweet_scraper.requests.get", side_effect=[page1, page2]) as mock_get:
        out = list(paged_get("http://x", {"query": "q"}, "key", limit=10))
    assert [t["id"] for t in out] == ["1", "2"]
    # second request must carry the cursor returned by page 1
    assert mock_get.call_args_list[1].kwargs["params"]["cursor"] == "c1"


def test_paged_get_retries_on_429_then_succeeds():
    bad = FakeResp(429, {})
    good = FakeResp(200, {"tweets": [{"id": "1"}], "has_next_page": False})
    with (
        patch("tweet_scraper.time.sleep"),
        patch("tweet_scraper.requests.get", side_effect=[bad, good]),
    ):
        out = list(paged_get("http://x", {}, "key", limit=10))
    assert [t["id"] for t in out] == ["1"]


def test_paged_get_retries_on_500_then_succeeds():
    bad = FakeResp(500, {})
    good = FakeResp(200, {"tweets": [{"id": "1"}], "has_next_page": False})
    with (
        patch("tweet_scraper.time.sleep"),
        patch("tweet_scraper.requests.get", side_effect=[bad, good]),
    ):
        out = list(paged_get("http://x", {}, "key", limit=10))
    assert [t["id"] for t in out] == ["1"]


def test_paged_get_retries_on_connection_error():
    good = FakeResp(200, {"tweets": [{"id": "1"}], "has_next_page": False})
    with (
        patch("tweet_scraper.time.sleep"),
        patch("tweet_scraper.requests.get", side_effect=[requests.ConnectionError(), good]),
    ):
        out = list(paged_get("http://x", {}, "key", limit=10))
    assert [t["id"] for t in out] == ["1"]


def test_paged_get_stops_when_no_tweets():
    resp = FakeResp(200, {"tweets": [], "has_next_page": True, "next_cursor": "c1"})
    with patch("tweet_scraper.requests.get", return_value=resp):
        out = list(paged_get("http://x", {}, "key", limit=10))
    assert out == []


# ---------- flatten media extraction (covers extendedEntities / entities) ----------


def test_flatten_extracts_media_from_extended_entities():
    tweet = {
        "id": "1",
        "author": {"userName": "u"},
        "extendedEntities": {
            "media": [
                {"media_url_https": "https://a.jpg"},
                {"media_url_https": "https://b.jpg"},
            ]
        },
    }
    row = flatten(tweet)
    assert row["hasMedia"] is True
    assert row["mediaUrls"] == "https://a.jpg;https://b.jpg"


def test_flatten_falls_back_to_entities_media():
    tweet = {
        "id": "1",
        "author": {"userName": "u"},
        "entities": {"media": [{"media_url": "https://only-url.jpg"}]},
    }
    row = flatten(tweet)
    assert row["mediaUrls"] == "https://only-url.jpg"


def test_flatten_no_media():
    row = flatten({"id": "1", "author": {"userName": "u"}, "text": "hi"})
    assert row["hasMedia"] is False
    assert row["mediaUrls"] == ""


def test_flatten_handles_missing_author():
    row = flatten({"id": "1", "text": "no author key"})
    assert row["authorUsername"] == ""
    assert row["id"] == "1"


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-q"]))
