"""Enable `python -m tweet_scraper` (equivalent to the `tweet-scraper` console script)."""

import sys

from .cli import main

if __name__ == "__main__":
    sys.exit(main())
