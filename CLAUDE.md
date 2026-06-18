# CLAUDE.md

Rules and context for AI-assisted work in this repo. Read top-to-bottom; the
hard rules come first because they matter most.

## Project

A two-part tweet toolkit (monorepo — two independent subprojects):

- **Scraper** — `scraper/` (`tweet_scraper.py`), a Python 3.11+ CLI that pulls
  tweets from twitterapi.io (pay-per-use) into a flat CSV. Config schema mirrors
  Apify Tweet Scraper V2.
- **Studio** — `studio/` (Vite + React 18 + Tailwind 4), a browser app that
  ingests the CSV for tone/sentiment tagging and draft assistance.

Data flow: `scraper/vars.json → scraper/tweet_scraper.py → tweets.csv → Tweet Studio`.

## Architecture

- `scraper/tweet_scraper/` — the CLI package (flat public API preserved via
  `__init__` re-exports, so `from tweet_scraper import X` still works). Modules:
  `config` (vars.json load/validate + date parsing), `query` (`build_query`,
  handle extraction), `api` (HTTP client: `paged_get` retry/cursor paging,
  per-endpoint fetchers — patch HTTP here, e.g. `tweet_scraper.api.requests`),
  `cli` (`flatten` tweet → CSV row, streaming writes, `main`).
- `scraper/tests/` — pytest, fully mocked (no network, no API key).
  `scraper/conftest.py` puts the scraper dir on `sys.path`.
- `studio/src/App.jsx` — the entire Studio UI (lexicons, tone patterns, CSV upload).
- Config/secrets: API key comes from the `TWITTERAPI_IO_KEY` env var.
  `scraper/vars.json` is run config and is git-ignored; `scraper/vars.example.json`
  is the committed template.
- Run Python tooling from `scraper/`; run the Studio from `studio/`.

## Rules (hard)

- NEVER commit `vars.json`, `tweets*.csv`, `.env`, or any secret/scraped data.
  Scraped CSVs contain third-party PII. Only `tweets.sample.csv` is allowed.
- NEVER read the API key from a file or hard-code it — only `TWITTERAPI_IO_KEY`.
- ALWAYS add or update a pytest test when changing scraper logic
  (`build_query`, `paged_get`, `flatten`, date parsing, etc.).
- ALWAYS keep the validation loop green before saying a change is done.
- Target Python 3.11+ (`datetime.UTC`, `X | None` annotations are fine).
- Tests must not hit the network — mock `tweet_scraper.requests`.

## Validation

Run the full loop from `scraper/` and make sure every step passes:

1. `ruff check .` — lint, zero errors
2. `ruff format --check .` — formatting
3. `mypy tweet_scraper.py` — type check
4. `pytest --cov=tweet_scraper` — all tests pass

(CI runs the same four steps from `scraper/` — see `.github/workflows/ci.yml`.)

## Commands (trigger keywords)

- When I say **"validate"** or **"ship it"** → run all four Validation steps and
  report results before doing anything else.
- When I say **"dry run"** → `python tweet_scraper.py --dry-run` (never spends credits).
- When I say **"scrape"** → `--dry-run` first, show me the queries, wait for OK,
  then run for real.

## Workflow

- Plan before executing; for non-trivial changes, propose the plan first.
- Commit to git before and after significant AI-assisted changes.
- The scraper (Python) and Studio (React) are independent — keep their contexts
  separate; `/clear` when switching between them.
- Persist durable decisions (API response-shape quirks, credit-saving paging
  logic) so they survive a fresh session.
