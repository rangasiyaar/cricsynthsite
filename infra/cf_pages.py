"""Cloudflare Pages settings for the static site, generated from firebase.json so the two hosts behave the same.

Writes <out>/_redirects and <out>/_headers (Pages reads them from the deployed folder) and checks the folder against
the Pages free-plan limits (20,000 files per deployment, 25 MiB per file).

    python3 infra/cf_pages.py --firebase firebase.json --out app/out

Conversions: Firebase "**" globs become Pages splats ("/*"); the one regex redirect (^/results/?$) becomes two exact
rules. Pages joins repeated headers with commas, so the cache rules are written for paths that don't overlap: the
hashed build assets (/_next/static/) get the year-long immutable cache; HTML keeps Pages' default (revalidate every
time, the edge cache is purged on each deployment).
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

MAX_FILES, WARN_FILES, MAX_BYTES = 20_000, 18_000, 25 * 1024 * 1024


def glob_to_splat(src: str) -> str:
    s = src.replace("/**", "/*").replace("**", "*")
    return s if s.startswith("/") else "/" + s


def redirects(site: dict) -> list[str]:
    out = []
    for r in site.get("redirects", []):
        dest, code = r["destination"], r.get("type", 301)
        if "regex" in r:
            if r["regex"] != "^/results/?$":
                raise SystemExit(f"cf_pages: convert this regex redirect by hand: {r['regex']}")
            out += [f"/results/ {dest} {code}", f"/results {dest} {code}"]
            continue
        out.append(f"{glob_to_splat(r['source'])} {dest} {code}")
    return out


def headers(site: dict) -> list[str]:
    by_source = {h["source"]: {x["key"]: x["value"] for x in h["headers"]} for h in site.get("headers", [])}
    blocks: list[tuple[str, dict]] = []
    security = by_source.get("**", {})
    if security:
        blocks.append(("/*", security))
    asset_cache = by_source.get("**/*.@(js|css|woff2|ttf|png|svg|webp)", {}).get("Cache-Control")
    if asset_cache:
        blocks.append(("/_next/static/*", {"Cache-Control": asset_cache}))
    for src in ("/data/**", "/download/app.json", "/pypi/**"):
        if src in by_source:
            blocks.append((glob_to_splat(src), by_source[src]))
    robots = next((v for k, v in by_source.items() if k.startswith("/@(admin|account)")), None)
    if robots:
        for p in ("/admin/*", "/account/*"):
            blocks.append((p, robots))
    lines = []
    for path, hs in blocks:
        lines.append(path)
        lines += [f"  {k}: {v}" for k, v in hs.items()]
    return lines


def check(out: Path) -> None:
    files = [p for p in out.rglob("*") if p.is_file()]
    big = [(p, p.stat().st_size) for p in files if p.stat().st_size > MAX_BYTES]
    print(f"cf_pages: {len(files)} files ({sum(p.stat().st_size for p in files) / 1e6:.0f} MB)")
    if big:
        raise SystemExit("cf_pages: files over 25 MiB (Pages refuses them): " + ", ".join(f"{p} {s}" for p, s in big))
    if len(files) > MAX_FILES:
        raise SystemExit(f"cf_pages: {len(files)} files, over the Pages limit of {MAX_FILES} per deployment")
    if len(files) > WARN_FILES:
        msg = f"{len(files)} files: close to the Pages limit of {MAX_FILES}; move /data to R2 or retire old match pages"
        print(f"::warning::{msg}" if os.environ.get("GITHUB_ACTIONS") else f"cf_pages: {msg}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--firebase", type=Path, default=Path("firebase.json"))
    ap.add_argument("--out", type=Path, default=Path("app/out"))
    a = ap.parse_args()
    hosting = json.loads(a.firebase.read_text())["hosting"]
    site = next(h for h in (hosting if isinstance(hosting, list) else [hosting]) if h.get("public") == "app/out")
    r, h = redirects(site), headers(site)
    (a.out / "_redirects").write_text("\n".join(r) + "\n")
    (a.out / "_headers").write_text("\n".join(h) + "\n")
    print(f"cf_pages: {len(r)} redirects, {sum(1 for x in h if not x.startswith(' '))} header rules")
    check(a.out)


if __name__ == "__main__":
    sys.exit(main())
