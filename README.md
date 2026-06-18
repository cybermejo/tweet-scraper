# Tweet Scraper + Tweet Studio

A two-part toolkit for collecting tweets and turning them into content insights:

1. **Tweet Scraper** (`scraper/`) — a Python CLI package that pulls tweets from
   [twitterapi.io](https://twitterapi.io) (pay-per-use, ~$0.15 / 1,000 tweets — no
   monthly X API subscription) and writes them to a flat CSV.
2. **Tweet Studio** (`studio/`) — a Vite + React app that ingests that CSV in the
   browser and does tone/sentiment tagging, engagement stats, and draft assistance.

```
scraper/vars.json ──▶ python -m tweet_scraper ──▶ tweets.csv ──▶ Tweet Studio ──▶ insights
```

The two halves are independent (separate toolchains); work on them from their
own subdirectory.

The scraper's config schema mirrors the **Apify Tweet Scraper V2** input, so an
existing `vars.json` works here unchanged.

> ⚠️ **Data & ethics.** Output CSVs contain third-party personal data (handles,
> names, tweet text). They are git-ignored on purpose — **do not commit scraped
> data or publish it**. Respect the X and twitterapi.io terms of service and any
> applicable privacy law. Only `tweets.sample.csv` (anonymized) is committed.

---

## Prerequisites

- Python 3.11+
- Node 18+ (only for Tweet Studio)
- A twitterapi.io API key

---

## Scraper — setup & usage

```bash
cd scraper
python -m venv .venv && source .venv/bin/activate   # recommended
pip install -e .                          # installs deps + a `tweet-scraper` command
export TWITTERAPI_IO_KEY="your_key_here"  # key comes from the env, never from a file

cp vars.example.json vars.json            # then edit vars.json for your run
tweet-scraper                             # reads ./vars.json, writes ./tweets.csv
```

`pip install -e .` installs the runtime dependency (`requests`) and a
`tweet-scraper` console command. Prefer not to install? `pip install -r
requirements.txt` then invoke the package directly with `python -m tweet_scraper`
— the two are equivalent.

Options (interchangeable with `python -m tweet_scraper ...`):

```bash
tweet-scraper --config path/to.json   # use a different config
tweet-scraper --out results.csv        # change output path
tweet-scraper --dry-run                # print the queries, don't call the API (free)
```

**Always `--dry-run` first** — it shows the exact queries that would be billed,
without spending credits.

### Configuration (`vars.json`)

Copy `vars.example.json` and edit. Key fields:

| Field                                                                             | Meaning                                                                        |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `searchTerms`                                                                     | Keywords/phrases to search (multi-word → exact phrase)                         |
| `twitterHandles`                                                                  | `@handles` whose timelines to fetch                                            |
| `startUrls`                                                                       | `x.com`/`twitter.com` profile URLs (handles are extracted)                     |
| `author`                                                                          | Restrict searches to one author (adds `from:`)                                 |
| `start` / `end`                                                                   | ISO `YYYY-MM-DD` window — inclusive; becomes `since:`/`until:` to save credits |
| `maxItems`                                                                        | Max tweets per query (default 100)                                             |
| `sort`                                                                            | `"Latest"` or `"Top"`                                                          |
| `tweetLanguage`                                                                   | e.g. `"en"` (adds `lang:en`)                                                   |
| `onlyVerifiedUsers` / `onlyTwitterBlue` / `onlyVideo` / `onlyImage` / `onlyQuote` | Boolean `filter:` toggles                                                      |
| `includeSearchTerms`                                                              | Write the source term/handle into a column                                     |
| `fetchReplies`                                                                    | Also fetch replies for tweets with `replyCount > 0`                            |
| `customMapFunction`                                                               | Ignored (an Apify JS-only feature)                                             |

Credit-saving behavior: `start`/`end` push date filtering server-side, and
user-timeline paging stops as soon as it passes `start` — no spend on old history.

### Output columns

`tweets.csv` has one row per tweet. See `tweets.sample.csv` for an example. Columns:
`id, url, createdAt, authorUsername, authorName, authorVerified, authorIsBlueVerified,
text, lang, likeCount, retweetCount, replyCount, quoteCount, viewCount, isRetweet,
isQuote, isReply, hasMedia, mediaUrls, sourceTerm, parentTweetId`.

---

## Tweet Studio — setup & usage

```bash
cd studio
npm install
npm run dev        # local dev server
npm run build      # production build into dist/
npm test           # Vitest unit tests (analysis / csv / lexicons / stats / display)
```

Open the app, upload a `tweets.csv` produced by the scraper, and explore the
tone/sentiment and engagement views.

---

## Development & validation

Install the dev toolchain, then run the validation loop from `scraper/` (this is
exactly what CI runs — see `.github/workflows/ci.yml`):

```bash
cd scraper
pip install -r requirements-dev.txt

ruff check .                 # lint
ruff format --check .        # formatting
mypy tweet_scraper           # type check
pytest --cov=tweet_scraper   # tests + coverage
```

Optional pre-commit guardrails (lint, format, and a block on committing
`vars.json`/scraped CSVs):

```bash
pip install pre-commit && pre-commit install
```

---

## Project structure

```
scraper/                  # Python CLI scraper
  tweet_scraper/          # the CLI package (flat public API via __init__)
    __init__.py           #   re-exports the public API
    __main__.py           #   enables `python -m tweet_scraper`
    config.py             #   vars.json load/validate + date parsing
    query.py              #   build_query + handle extraction
    api.py                #   twitterapi.io HTTP client (paging/retry, fetchers)
    cli.py                #   flatten → CSV, streaming writes, main
  tests/                  # pytest suite (no network / no API key needed)
  conftest.py             # makes tweet_scraper importable from tests
  requirements.txt        # runtime deps
  requirements-dev.txt    # dev/validation deps
  pyproject.toml          # [project] packaging + ruff / mypy / pytest config
  vars.example.json       # template config — copy to vars.json (git-ignored)
  tweets.sample.csv       # tiny anonymized example output
studio/                   # Tweet Studio (Vite + React)
  index.html, vite.config.js, package.json, src/
.github/workflows/ci.yml  # runs the scraper validation loop
.claude/                  # CLAUDE.md rules + hooks (format on save, PII guard)
CLAUDE.md                 # AI-assistant rules & validation loop
```

## Roadmap

Done: packaging (`[project]` + `tweet-scraper` console entry point), the
`config / query / api / cli` package split, config-schema validation, and the
move to the `logging` module. Possible next steps:

- Tweet Studio: list virtualization for very large CSVs (the Tweets tab caps the
  rendered list and shows a "top N of M" notice today).
- Retry/backoff tuning and configurable rate limits for `paged_get`.

## License

[MIT](LICENSE) © 2026 Christian Bermejo
