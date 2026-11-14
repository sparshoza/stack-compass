"""Check that every tool url, repo and source responds. Run by hand before shipping."""

import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import httpx

from .load import load_kb

DATA = Path(__file__).resolve().parents[2] / "data"
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0 Safari/537.36"
)
TIMEOUT = 10.0

# Hosts known to refuse automated requests even though the pages are valid.
# Map: url prefix -> status codes accepted for it.
BOT_BLOCKED: dict[str, set[int]] = {
    # Oracle answers 403 to automated clients; the pages load in a browser.
    "https://www.mysql.com": {403},
    "https://dev.mysql.com": {403},
    # Mailgun and OpenSearch answer 403 to automated clients; the official pages load in a browser.
    "https://www.mailgun.com": {403},
    "https://opensearch.org": {403},
    # GitHub rate limits bursts of requests with 429.
    "https://github.com/": {429},
}


def check_url(client: httpx.Client, url: str) -> str | None:
    """Return None when the url responds, else a short failure description."""
    status: int | str
    try:
        status = client.head(url).status_code
        if status >= 400:
            status = client.get(url).status_code
    except httpx.HTTPError:
        try:
            status = client.get(url).status_code
        except httpx.HTTPError as e:
            return f"{type(e).__name__}"
    if status < 400:
        return None
    for prefix, codes in BOT_BLOCKED.items():
        if url.startswith(prefix) and status in codes:
            return None
    return f"HTTP {status}"


def collect_urls(data_dir: Path) -> dict[str, list[str]]:
    kb = load_kb(data_dir)
    urls: dict[str, list[str]] = {}
    for tool in kb.tools.values():
        for u in [tool.url, *([tool.repo] if tool.repo else []), *tool.sources]:
            owners = urls.setdefault(u, [])
            if tool.id not in owners:
                owners.append(tool.id)
    return urls


def main() -> int:
    urls = collect_urls(DATA)
    with httpx.Client(
        follow_redirects=True, timeout=TIMEOUT, headers={"User-Agent": USER_AGENT}
    ) as client, ThreadPoolExecutor(max_workers=16) as pool:
        results = list(pool.map(lambda u: (u, check_url(client, u)), urls))
    failures = [(u, why) for u, why in results if why]
    for u, why in failures:
        print(f"FAIL {why}: {u} (used by {', '.join(urls[u])})")
    print(f"checked {len(urls)} urls, {len(failures)} failed")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
