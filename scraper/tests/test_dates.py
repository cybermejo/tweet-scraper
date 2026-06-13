"""Date parsing — config dates and the multi-format tweet timestamp parser."""

from datetime import UTC, datetime

from tweet_scraper import parse_config_date, tweet_created_at


def test_parse_config_date_none_returns_none():
    assert parse_config_date(None) is None
    assert parse_config_date("") is None


def test_parse_config_date_basic():
    dt = parse_config_date("2025-07-31")
    assert dt == datetime(2025, 7, 31, tzinfo=UTC)


def test_parse_config_date_end_of_day():
    dt = parse_config_date("2025-07-31", end_of_day=True)
    assert (dt.hour, dt.minute, dt.second) == (23, 59, 59)


def test_tweet_created_at_classic_twitter_format():
    dt = tweet_created_at({"createdAt": "Thu Apr 17 14:30:00 +0000 2026"})
    assert dt == datetime(2026, 4, 17, 14, 30, 0, tzinfo=UTC)


def test_tweet_created_at_iso_format():
    dt = tweet_created_at({"created_at": "2026-04-17T14:30:00.000Z"})
    assert dt is not None
    assert (dt.year, dt.month, dt.day) == (2026, 4, 17)


def test_tweet_created_at_missing_returns_none():
    assert tweet_created_at({}) is None


def test_tweet_created_at_garbage_returns_none():
    assert tweet_created_at({"createdAt": "not a date"}) is None
