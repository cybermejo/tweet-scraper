"""Config validation: warn on unknown keys, reject wrong types early.

Unknown keys only warn because the config schema mirrors the Apify Tweet Scraper
V2 input (a superset of what this script implements), so a real Apify vars.json
must still load unchanged.
"""

import json

import pytest

from tweet_scraper import DEFAULTS, load_config, validate_config


def test_validate_config_accepts_a_valid_config():
    validate_config({"searchTerms": ["cats"], "maxItems": 100, "sort": "Latest"})


def test_validate_config_allows_null_for_nullable_fields():
    validate_config({"author": None, "start": None, "end": None, "tweetLanguage": None})


def test_validate_config_allows_bools_and_lists():
    validate_config({"onlyVideo": True, "fetchReplies": False, "twitterHandles": ["a"]})


def test_validate_config_rejects_wrong_type_for_known_key():
    with pytest.raises(SystemExit):
        validate_config({"maxItems": "100"})  # int expected, not str


def test_validate_config_rejects_non_list_search_terms():
    with pytest.raises(SystemExit):
        validate_config({"searchTerms": "cats"})  # list expected


def test_validate_config_warns_on_unknown_key_but_does_not_raise(capsys):
    validate_config({"searchTermz": ["typo"]})  # unknown key -> warn, not error
    err = capsys.readouterr().err
    assert "searchTermz" in err
    assert "unknown" in err.lower()


def test_load_config_merges_defaults(tmp_path):
    p = tmp_path / "vars.json"
    p.write_text(json.dumps({"searchTerms": ["cats"]}), encoding="utf-8")
    cfg = load_config(p)
    assert cfg["searchTerms"] == ["cats"]
    assert cfg["maxItems"] == DEFAULTS["maxItems"]
    assert cfg["sort"] == DEFAULTS["sort"]


def test_load_config_rejects_non_object_top_level(tmp_path):
    p = tmp_path / "vars.json"
    p.write_text(json.dumps(["not", "an", "object"]), encoding="utf-8")
    with pytest.raises(SystemExit):
        load_config(p)


def test_load_config_rejects_bad_type(tmp_path):
    p = tmp_path / "vars.json"
    p.write_text(json.dumps({"maxItems": "lots"}), encoding="utf-8")
    with pytest.raises(SystemExit):
        load_config(p)
