"""Build the MCP package and a PEP 503 "simple" index for it, to be served by Firebase Hosting with the site.

    python cricmcp/build_index.py --out app/out/pypi

Users install with `uvx --index https://<site>/pypi/simple/ cricsynthesis-mcp`; every other dependency still
comes from PyPI (uv only uses this index for the packages it lists).
"""
from __future__ import annotations

import argparse
import hashlib
import html
import shutil
import subprocess
import tempfile
from pathlib import Path

NAME = "cricsynthesis-mcp"
ROOT = Path(__file__).resolve().parent


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", type=Path, required=True)
    out = ap.parse_args().out
    with tempfile.TemporaryDirectory() as tmp:
        subprocess.run(["uv", "build", "--wheel", "--out-dir", tmp, str(ROOT)], check=True)
        wheels = sorted(Path(tmp).glob("*.whl"))
        files = out / "files"
        files.mkdir(parents=True, exist_ok=True)
        for w in wheels:
            shutil.copy(w, files / w.name)
    links = []
    for w in sorted(files.glob("cricsynthesis_mcp-*.whl")):
        sha = hashlib.sha256(w.read_bytes()).hexdigest()
        links.append(f'<a href="../../files/{html.escape(w.name)}#sha256={sha}" data-requires-python="&gt;=3.10">'
                     f"{html.escape(w.name)}</a><br>")
    pkg = out / "simple" / NAME
    pkg.mkdir(parents=True, exist_ok=True)
    (pkg / "index.html").write_text("<!DOCTYPE html><html><body>\n" + "\n".join(links) + "\n</body></html>\n")
    (out / "simple" / "index.html").write_text(
        f'<!DOCTYPE html><html><body><a href="{NAME}/">{NAME}</a></body></html>\n')
    print(f"{len(links)} wheel(s) indexed in {out}")


if __name__ == "__main__":
    main()
