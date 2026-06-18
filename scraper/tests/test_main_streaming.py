"""End-to-end streaming behavior of main().

Rows are written to the CSV as they are fetched, so a mid-run crash still
leaves the already-fetched (and already-paid-for) tweets on disk. All HTTP is
mocked — no network, no API key spend.
"""

import csv
import json
import os
import sys
from unittest.mock import patch

import pytest
import requests

from tweet_scraper import main


class FakeResp:
    def __init__(self, status_code, payload):
        self.status_code = status_code
        self._payload = payload

    def json(self):
        return self._payload

    def raise_for_status(self):
        if self.status_code >= 400:
            raise requests.HTTPError(f"status {self.status_code}")


def _tweet(tweet_id, **extra):
    return {"id": tweet_id, "author": {"userName": "user"}, "text": "text", **extra}


def _write_config(tmp_path, **overrides):
    cfg = {"searchTerms": ["cats"], "maxItems": 100}
    cfg.update(overrides)
    path = tmp_path / "vars.json"
    path.write_text(json.dumps(cfg), encoding="utf-8")
    return path


def _read_csv(path):
    with open(path, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def _run_main(config_path, out_path):
    argv = ["tweet_scraper.py", "--config", str(config_path), "--out", str(out_path)]
    with patch.object(sys, "argv", argv):
        return main()


def test_main_writes_scraped_tweets_to_csv(tmp_path):
    config = _write_config(tmp_path)
    out = tmp_path / "out.csv"
    page = FakeResp(200, {"tweets": [_tweet("1"), _tweet("2")], "has_next_page": False})
    with (
        patch.dict(os.environ, {"TWITTERAPI_IO_KEY": "k"}),
        patch("tweet_scraper.api.requests.get", return_value=page),
    ):
        rc = _run_main(config, out)
    assert rc == 0
    assert [r["id"] for r in _read_csv(out)] == ["1", "2"]


def test_main_writes_user_timeline_tweets(tmp_path):
    config = _write_config(tmp_path, searchTerms=[], twitterHandles=["someone"])
    out = tmp_path / "out.csv"
    page = FakeResp(200, {"tweets": [_tweet("1"), _tweet("2")], "has_next_page": False})
    with (
        patch.dict(os.environ, {"TWITTERAPI_IO_KEY": "k"}),
        patch("tweet_scraper.api.requests.get", return_value=page),
    ):
        rc = _run_main(config, out)
    assert rc == 0
    assert [r["id"] for r in _read_csv(out)] == ["1", "2"]


def test_main_persists_rows_fetched_before_a_midrun_crash(tmp_path):
    config = _write_config(tmp_path)
    out = tmp_path / "out.csv"
    page1 = FakeResp(200, {"tweets": [_tweet("1")], "has_next_page": True, "next_cursor": "c1"})
    # Page 2 fails persistently; paged_get retries (max_retries=3) then re-raises.
    side_effect = [page1] + [requests.ConnectionError()] * 4
    with (
        patch.dict(os.environ, {"TWITTERAPI_IO_KEY": "k"}),
        patch("tweet_scraper.api.time.sleep"),
        patch("tweet_scraper.api.requests.get", side_effect=side_effect),
        pytest.raises(requests.ConnectionError),
    ):
        _run_main(config, out)
    # The crash propagated, but page-1's tweet was already flushed to disk.
    assert out.exists(), "output file should hold partial data after a mid-run crash"
    assert [r["id"] for r in _read_csv(out)] == ["1"]


def test_main_streams_replies_after_main_tweets(tmp_path):
    config = _write_config(tmp_path, fetchReplies=True)
    out = tmp_path / "out.csv"
    search_page = FakeResp(200, {"tweets": [_tweet("1", replyCount=1)], "has_next_page": False})
    reply_page = FakeResp(200, {"tweets": [_tweet("99")], "has_next_page": False})
    with (
        patch.dict(os.environ, {"TWITTERAPI_IO_KEY": "k"}),
        patch("tweet_scraper.api.requests.get", side_effect=[search_page, reply_page]),
    ):
        rc = _run_main(config, out)
    assert rc == 0
    rows = _read_csv(out)
    assert [r["id"] for r in rows] == ["1", "99"]
    assert rows[1]["parentTweetId"] == "1"


def test_main_skips_reply_fetch_when_reply_count_zero(tmp_path):
    config = _write_config(tmp_path, fetchReplies=True)
    out = tmp_path / "out.csv"
    search_page = FakeResp(200, {"tweets": [_tweet("1", replyCount=0)], "has_next_page": False})
    with (
        patch.dict(os.environ, {"TWITTERAPI_IO_KEY": "k"}),
        patch("tweet_scraper.api.requests.get", side_effect=[search_page]) as mock_get,
    ):
        rc = _run_main(config, out)
    assert rc == 0
    assert mock_get.call_count == 1  # no second call for replies
    assert [r["id"] for r in _read_csv(out)] == ["1"]
