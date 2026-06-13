import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from unittest.mock import patch

from tweet_scraper import (
    API_BASE,
    CSV_COLUMNS,
    DEFAULTS,
    TWEET_REPLIES_URL,
    _collect_replies,
    flatten,
    tweet_replies,
)


def test_csv_columns_includes_parent_tweet_id():
    assert "parentTweetId" in CSV_COLUMNS


def test_flatten_parent_tweet_id_empty_by_default():
    tweet = {
        "id": "123",
        "author": {"userName": "testuser", "name": "Test User"},
        "text": "hello world",
    }
    row = flatten(tweet)
    assert row["parentTweetId"] == ""


def test_flatten_parent_tweet_id_populated_when_provided():
    tweet = {
        "id": "456",
        "author": {"userName": "replyuser", "name": "Reply User"},
        "text": "this is a reply",
    }
    row = flatten(tweet, parent_id="123")
    assert row["parentTweetId"] == "123"


def test_flatten_source_term_and_parent_id_are_independent():
    tweet = {
        "id": "789",
        "author": {"userName": "u", "name": "U"},
        "text": "text",
    }
    row = flatten(tweet, source_term="keyword", parent_id="100")
    assert row["sourceTerm"] == "keyword"
    assert row["parentTweetId"] == "100"


def test_tweet_replies_url_constant():
    assert TWEET_REPLIES_URL == f"{API_BASE}/twitter/tweet/replies/v2"


def test_fetch_replies_default_is_false():
    assert DEFAULTS["fetchReplies"] is False


def test_tweet_replies_calls_paged_get_with_correct_args():
    mock_reply = {
        "id": "999",
        "author": {"userName": "replier", "name": "Replier"},
        "text": "great tweet",
    }
    with patch("tweet_scraper.paged_get", return_value=iter([mock_reply])) as mock_pg:
        results = list(tweet_replies("123", "test_key", 20))
    mock_pg.assert_called_once_with(
        TWEET_REPLIES_URL,
        {"tweetId": "123"},
        "test_key",
        20,
    )
    assert len(results) == 1
    assert results[0]["id"] == "999"


def test_tweet_replies_returns_empty_when_no_replies():
    with patch("tweet_scraper.paged_get", return_value=iter([])):
        results = list(tweet_replies("123", "test_key", 20))
    assert results == []


def _make_row(tweet_id, reply_count, parent_id=""):
    return {
        "id": tweet_id,
        "url": f"https://x.com/u/status/{tweet_id}",
        "createdAt": "",
        "authorUsername": "user",
        "authorName": "User",
        "authorVerified": False,
        "authorIsBlueVerified": False,
        "text": "tweet text",
        "lang": "en",
        "likeCount": 0,
        "retweetCount": 0,
        "replyCount": reply_count,
        "quoteCount": 0,
        "viewCount": 0,
        "isRetweet": False,
        "isQuote": False,
        "isReply": False,
        "hasMedia": False,
        "mediaUrls": "",
        "sourceTerm": "",
        "parentTweetId": parent_id,
    }


def test_collect_replies_appends_replies_for_tweets_with_reply_count():
    rows = [_make_row("100", reply_count=2)]
    seen = {"100"}
    mock_reply = {
        "id": "999",
        "author": {"userName": "replier", "name": "Replier"},
        "text": "reply text",
    }
    with patch("tweet_scraper.tweet_replies", return_value=iter([mock_reply])):
        _collect_replies(rows, seen, "api_key", 100)
    assert len(rows) == 2
    assert rows[1]["id"] == "999"
    assert rows[1]["parentTweetId"] == "100"


def test_collect_replies_skips_tweets_with_zero_reply_count():
    rows = [_make_row("200", reply_count=0)]
    seen = {"200"}
    with patch("tweet_scraper.tweet_replies") as mock_tr:
        _collect_replies(rows, seen, "api_key", 100)
    mock_tr.assert_not_called()
    assert len(rows) == 1


def test_collect_replies_deduplicates_already_seen_replies():
    rows = [_make_row("300", reply_count=1)]
    seen = {"300", "999"}
    mock_reply = {
        "id": "999",
        "author": {"userName": "r", "name": "R"},
        "text": "dupe",
    }
    with patch("tweet_scraper.tweet_replies", return_value=iter([mock_reply])):
        _collect_replies(rows, seen, "api_key", 100)
    assert len(rows) == 1


def test_collect_replies_skips_empty_tweet_id():
    rows = [_make_row("", reply_count=5)]
    seen = set()
    with patch("tweet_scraper.tweet_replies") as mock_tr:
        _collect_replies(rows, seen, "api_key", 100)
    mock_tr.assert_not_called()
