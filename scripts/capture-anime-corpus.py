"""Capture a corpus of real anime release filenames from nyaa.si.

Usage:
    python scripts/capture-anime-corpus.py [--limit=N]

Output lands in ./captured/anime-filenames.json next to this script. Move it
into src/main/features/catalog/__fixtures__/ once you are happy with it.

This is an offline, one-time capture, run by a developer, never by the app at
runtime. It exists to validate catalog.parser.ts against real fansub naming
variety instead of hand-written guesses, the same reasoning that already
drives capture-vlc-fixtures.py for VLC's HTTP responses.

Category 1_2 on nyaa.si is "Anime - English-translated". The RSS feed there
mixes batch releases ("(01-13) [Batch]") with single-episode ones; only the
latter matter here, since VLC always plays one file, never a batch archive.
"""

import json
import pathlib
import re
import sys
import urllib.request

FEED_URL = "https://nyaa.si/?page=rss&c=1_2&f=0"
OUT = pathlib.Path(__file__).parent / "captured"

BATCH_PATTERN = re.compile(r"\[Batch\]|\(\d{2,3}\s*-\s*\d{2,3}\)|\bBatch\b", re.IGNORECASE)


def fetch_titles(limit):
    req = urllib.request.Request(FEED_URL, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=15) as response:
        body = response.read()

    import xml.etree.ElementTree as ET

    root = ET.fromstring(body)
    titles = [item.find("title").text for item in root.iter("item")]
    singles = [t for t in titles if not BATCH_PATTERN.search(t)]
    return singles[:limit]


def main():
    limit = 60
    for arg in sys.argv[1:]:
        if arg.startswith("--limit="):
            limit = int(arg.split("=", 1)[1])

    titles = fetch_titles(limit)
    if not titles:
        print("No single-episode titles found, nyaa.si may be unreachable or its markup changed.")
        sys.exit(1)

    OUT.mkdir(exist_ok=True)
    out_file = OUT / "anime-filenames.json"
    out_file.write_text(json.dumps(titles, indent=2, ensure_ascii=False), encoding="utf-8")

    print(f"Captured {len(titles)} filenames to {out_file}")


if __name__ == "__main__":
    main()
