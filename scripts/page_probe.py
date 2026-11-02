"""Read a public website politely for research: honours robots.txt, same-site links only, at most N pages, one
request a second. Prints each page's title and visible text (no scripts or styles).

python scripts/page_probe.py https://example.com --pages 30
"""
import argparse
import re
import time
import urllib.parse
import urllib.request
import urllib.robotparser
from html.parser import HTMLParser

AGENT = "Mozilla/5.0 (compatible; research-reader/1.0)"


class Page(HTMLParser):
    def __init__(self):
        super().__init__()
        self.text, self.links, self.title, self._skip, self._in_title = [], [], "", 0, False

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style", "noscript", "svg"):
            self._skip += 1
        if tag == "title":
            self._in_title = True
        if tag == "a":
            href = dict(attrs).get("href")
            if href:
                self.links.append(href)

    def handle_endtag(self, tag):
        if tag in ("script", "style", "noscript", "svg") and self._skip:
            self._skip -= 1
        if tag == "title":
            self._in_title = False

    def handle_data(self, data):
        if self._in_title:
            self.title += data
        elif not self._skip and data.strip():
            self.text.append(data.strip())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("url")
    ap.add_argument("--pages", type=int, default=30)
    a = ap.parse_args()
    start = a.url.rstrip("/") + "/"
    host = urllib.parse.urlparse(start).netloc
    robots = urllib.robotparser.RobotFileParser(urllib.parse.urljoin(start, "/robots.txt"))
    try:
        robots.read()
    except Exception as e:
        print(f"robots.txt unreadable ({e}); continuing with care")
    seen, queue, done = set(), [start], 0
    while queue and done < a.pages:
        url = queue.pop(0).split("#")[0]
        if url in seen:
            continue
        seen.add(url)
        if not robots.can_fetch(AGENT, url):
            print(f"\n=== SKIPPED (robots.txt): {url}")
            continue
        try:
            req = urllib.request.Request(url, headers={"User-Agent": AGENT})
            with urllib.request.urlopen(req, timeout=20) as r:
                if "html" not in (r.headers.get("Content-Type") or ""):
                    continue
                html = r.read().decode("utf-8", "replace")
        except Exception as e:
            print(f"\n=== ERROR {url}: {e}")
            continue
        p = Page()
        p.feed(html)
        done += 1
        text = re.sub(r"\s+", " ", " | ".join(p.text))
        print(f"\n=== PAGE {done}: {url}\nTITLE: {p.title.strip()}\nTEXT: {text[:6000]}")
        for href in p.links:
            u = urllib.parse.urljoin(url, href)
            if urllib.parse.urlparse(u).netloc == host and u not in seen and u.startswith("http"):
                queue.append(u)
        time.sleep(1)
    print(f"\n{done} pages read; {len(queue)} more links not followed")


if __name__ == "__main__":
    main()
