"""Pro data on the public site: each match and venue file keeps what the free Overview shows, a masked teaser for the
Pro tabs, and the full forecast encrypted (AES-256-GCM). Signed-in Pro accounts get the match's key from the API
Worker (GET /pro/key, edge/src/prokey.ts); the Worker and our own jobs (Instagram carousels) decrypt with the shared
secret PRO_DATA_KEY. Without the secret nothing is locked (the files stay as they are).

    python -m cricsim.lock --data app/out/data          # after `next build` (build-time pages read the full files)

Public match file:
  match, generated_at, model, published, sim_key        as before
  summary, fantasy                                      only what the Overview reads (real values)
  teaser: {summary, fantasy}                            the Pro tabs' shape: TEASER_SHARE of players and entries
                                                        real, everyone else with hidden names and ids and shuffled
                                                        numbers (nothing true about them)
  masked: true, locked: {v, iv, ct}                     {summary, fantasy, insights} encrypted
Public venue file: the teaser venue (ground-level figures the Overview shows stay real) + masked + locked.
Engine packs (MatchSynth Lab, the live projection) and results stay public.
"""
from __future__ import annotations

import base64
import copy
import hashlib
import hmac
import json
import math
import os
import random
from pathlib import Path

import click

TEASER_SHARE = 0.20
MASK = "████████"
NAME_KEYS = ("name",)


# ── keys and encryption ──────────────────────────────────────────────────────────────────────────────────────────

def key_for(secret: str, match_id: str) -> bytes:
    """The match's 32-byte key (the same for its forecast and its venue file); edge/src/prokey.ts derives it the same way."""
    return hmac.new(secret.encode(), f"cs-pro:{match_id}".encode(), hashlib.sha256).digest()


def encrypt(obj, key: bytes) -> dict:
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    iv = os.urandom(12)
    ct = AESGCM(key).encrypt(iv, json.dumps(obj, separators=(",", ":")).encode(), None)     # ciphertext ‖ tag (WebCrypto's layout)
    return {"v": 1, "iv": base64.b64encode(iv).decode(), "ct": base64.b64encode(ct).decode()}


def decrypt(box: dict, key: bytes):
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    return json.loads(AESGCM(key).decrypt(base64.b64decode(box["iv"]), base64.b64decode(box["ct"]), None))


def unlock_match(doc: dict, secret: str | None) -> dict:
    """The full match document (unchanged when it isn't locked or there's no secret)."""
    if not doc or not doc.get("locked") or not secret:
        return doc
    full = decrypt(doc["locked"], key_for(secret, doc["match"]["id"]))
    out = {k: v for k, v in doc.items() if k not in ("locked", "masked", "teaser")}
    return {**out, **full}


def unlock_venue(doc: dict, match_id: str, secret: str | None) -> dict:
    if not doc or not doc.get("locked") or not secret:
        return doc
    return decrypt(doc["locked"], key_for(secret, match_id))


# ── what the Overview reads (components/Snapshot.tsx) ────────────────────────────────────────────────────────────

def _top(players: list, field: str, key, n=5, cond=lambda p: True) -> list:
    rows = [p for p in players if p.get(field) and cond(p) and p.get("name")]
    return sorted(rows, key=key, reverse=True)[:n]


def overview_summary(s: dict) -> dict:
    teams = []
    for t in s["teams"]:
        b = t["batting"]
        bats = {p["id"] for p in _top(t["players"], "batting", lambda p: (p["batting"].get("runs") or {}).get("mean") or 0)}
        bowls = {p["id"] for p in _top(t["players"], "bowling", lambda p: (p["bowling"].get("wickets") or {}).get("mean") or 0,
                                        cond=lambda p: (p["bowling"].get("p_bowls") or 0) > 0.5)}
        players = []
        for p in t["players"]:
            q = {k: p[k] for k in ("id", "name", "known") if k in p}
            if p["id"] in bats:
                q["batting"] = {"runs": p["batting"].get("runs")}
            if p["id"] in bowls:
                q["bowling"] = {"p_bowls": p["bowling"].get("p_bowls"), "wickets": p["bowling"].get("wickets")}
            players.append(q)
        teams.append({"name": t["name"], "players": players, "batting": {
            "score": {k: b["score"][k] for k in ("mean", "q") if k in b["score"]},
            "wickets": {k: b["wickets"][k] for k in ("mean", "q") if k in b["wickets"]},
            "phases": b.get("phases", []),
            "per_over": [{k: o[k] for k in ("over", "runs", "p_wicket") if k in o} for o in b.get("per_over", [])],
            "fall_of_wickets": [{k: f[k] for k in ("wicket", "p", "over") if k in f} for f in b.get("fall_of_wickets", [])],
        }})
    return {"meta": s.get("meta"), "result": s.get("result"), "teams": teams, "matchups": (s.get("matchups") or [])[:1]}


def overview_fantasy(f: dict | None) -> dict | None:
    if not f:
        return None
    single = f["single"]
    keep = set(single.get("players", [])) | {single.get("captain"), single.get("vice_captain")}
    players = {i: {k: v for k, v in p.items() if k in ("team", "role", "name", "expected")}
               for i, p in (f.get("players") or {}).items() if i in keep}
    return {"single": single, "players": players, "format": f.get("format")}


# ── the teaser: the Pro tabs' shape, mostly masked ───────────────────────────────────────────────────────────────

def _n_real(n: int) -> int:
    return max(1, math.ceil(n * TEASER_SHARE)) if n else 0


def _leaves(o, path=()):
    """(path, number) for every number inside o."""
    if isinstance(o, bool):
        return
    if isinstance(o, (int, float)):
        yield path, o
    elif isinstance(o, dict):
        for k, v in o.items():
            yield from _leaves(v, path + (k,))
    elif isinstance(o, list):
        for i, v in enumerate(o):
            yield from _leaves(v, path + (i,))


def _set(o, path, v):
    for k in path[:-1]:
        o = o[k]
    o[path[-1]] = v


def _shuffle_numbers(items: list, rng: random.Random):
    """Shuffle each numeric field among `items` (same path in each), so the values are realistic but belong to nobody."""
    by_path: dict = {}
    for i, it in enumerate(items):
        for path, v in _leaves(it):
            by_path.setdefault(path, []).append((i, v))
    for path, rows in by_path.items():
        vals = [v for _, v in rows]
        rng.shuffle(vals)
        for (i, _), v in zip(rows, vals):
            _set(items[i], path, v)


def _scramble_tail(o, rng: random.Random):
    """Keep the first TEASER_SHARE of every list real; shuffle the rest (whole elements), recursively."""
    if isinstance(o, dict):
        for k, v in o.items():
            o[k] = _scramble_tail(v, rng)
    elif isinstance(o, list) and len(o) > 1:
        k = _n_real(len(o))
        head, tail = o[:k], o[k:]
        if tail and all(isinstance(x, dict) for x in tail):
            _shuffle_numbers(tail, rng)            # objects keep their labels (over, wicket, phase), values move
        else:
            rng.shuffle(tail)
        return [_scramble_tail(x, rng) for x in head] + tail
    return o


def _rename(o, ids: dict, names: set):
    """Replace masked player ids (values and keys) and names everywhere."""
    if isinstance(o, dict):
        return {ids.get(k, k): _rename(v, ids, names) for k, v in o.items()}
    if isinstance(o, list):
        return [_rename(v, ids, names) for v in o]
    if isinstance(o, str):
        if o in ids:
            return ids[o]
        if o in names:
            return MASK
    return o


def _real_players(s: dict, f: dict | None) -> set:
    """The players whose figures the teaser keeps real: those that open the top of each Pro section (the top 20% of
    each card is shown clear). Batting order's first, the leading run-scorers and wicket-takers (the Top players
    and MVP rankings), the batters and bowlers in the leading match-ups, and the fantasy captain, vice-captain,
    keeper and leading batters (the top of the pitch)."""
    real: set = set()
    everyone = [p for t in s["teams"] for p in t["players"]]
    n = max(1, math.ceil(len(everyone) * TEASER_SHARE))                # about 20% of the players in each ranking
    runs = lambda p: ((p.get("batting") or {}).get("runs") or {}).get("mean") or 0           # noqa: E731
    wkts = lambda p: ((p.get("bowling") or {}).get("wickets") or {}).get("mean") or 0        # noqa: E731
    for t in s["teams"]:
        real |= {p["id"] for p in t["players"][:_n_real(len(t["players"]))]}                  # batting order's first
    real |= {p["id"] for p in sorted(everyone, key=runs, reverse=True)[:n]}
    real |= {p["id"] for p in sorted([p for p in everyone if ((p.get("bowling") or {}).get("p_bowls") or 0) > 0.5], key=wkts, reverse=True)[:n]}
    real |= {p["id"] for p in sorted(everyone, key=lambda p: runs(p) + 20 * wkts(p), reverse=True)[:n]}
    for m in (s.get("matchups") or [])[:_n_real(len(s.get("matchups") or []))]:
        real |= {m.get("batter"), m.get("bowler")}
    if f:
        single = f.get("single") or {}
        fp = f.get("players") or {}
        real |= {single.get("captain"), single.get("vice_captain")}
        real |= {i for i in single.get("players", []) if (fp.get(i) or {}).get("role") == "WK"}
        bats = [i for i in single.get("players", []) if (fp.get(i) or {}).get("role") == "BAT"]
        real |= set(sorted(bats, key=lambda i: (fp.get(i) or {}).get("expected") or 0, reverse=True)[:3])
    real.discard(None)
    return real


def teaser(doc: dict, seed: str) -> dict:
    """{summary, fantasy}: the players that open each Pro section real (_real_players), everyone else with a hidden
    name and id and shuffled numbers; team-level figures real (the Overview shows most of them already)."""
    rng = random.Random(seed)
    s = copy.deepcopy(doc["summary"])
    f = copy.deepcopy(doc.get("fantasy"))
    real = _real_players(s, f)
    ids: dict = {}
    names: set = set()
    n = 0
    for t in s["teams"]:
        masked = [p for p in t["players"] if p["id"] not in real]
        for p in masked:
            n += 1
            ids[p["id"]] = f"x{n:02d}"
            if p.get("name"):
                names.add(p["name"])
            p["name"] = MASK                 # profile kept: its numbers are shuffled with the rest below
        _shuffle_numbers(masked, rng)
    m_list = s.get("matchups") or []
    k = _n_real(len(m_list))
    tail = m_list[k:]
    _shuffle_numbers(tail, rng)
    s["matchups"] = m_list[:k] + tail
    if f:
        fp = f.get("players") or {}
        others = [i for i in fp if i not in real]
        for i in others:
            if i not in ids:
                n += 1
                ids[i] = f"x{n:02d}"
            nm = fp[i].get("name")
            if nm:
                names.add(nm)
            fp[i]["name"] = MASK
        _shuffle_numbers([fp[i] for i in others], rng)
        pool = list(fp)
        for team in (f.get("teams") or [])[_n_real(len(f.get("teams") or [])):]:
            if isinstance(team, dict) and team.get("players"):
                team["players"] = rng.sample(pool, min(len(team["players"]), len(pool)))
                team["captain"], team["vice_captain"] = team["players"][0], team["players"][1]
    # names and ids of masked players disappear everywhere (dismissed_by, fall of wickets, matchups, fantasy lists)
    real_names = {p["name"] for t in s["teams"] for p in t["players"] if p.get("name") and p["name"] != MASK}
    names -= real_names
    return {"summary": _rename(s, ids, names), "fantasy": _rename(f, ids, names) if f else None}


def teaser_venue(v: dict, seed: str) -> dict:
    """The venue tab's shape: ground-level figures the Overview shows stay real; player lists keep TEASER_SHARE real."""
    rng = random.Random(seed)
    out = copy.deepcopy(v)
    hist = out.get("history") or {}
    keep_hist = copy.deepcopy({k: hist.get(k) for k in ("matches", "from", "to", "first_innings", "bat_first_won", "recent") if k in hist})
    keep_bowling = copy.deepcopy(((out.get("bowling") or {}).get("here")) or {})      # pace v spin share (Overview)
    for k in ("players", "fantasy"):
        if k in out:
            out[k] = _scramble_names(out[k], rng)
    for k in ("model", "phases", "history"):
        if k in out:
            out[k] = _scramble_tail(out[k], rng)
    if "bowling" in out:
        out["bowling"] = _scramble_tail(out["bowling"], rng)
        out["bowling"]["here"] = {**out["bowling"].get("here", {}), **{k: {"share_of_wickets": (keep_bowling.get(k) or {}).get("share_of_wickets"), **(out["bowling"].get("here", {}).get(k) or {})}
                                                                          for k in ("pace", "spin") if k in keep_bowling}}
        for k in ("pace", "spin"):
            if k in keep_bowling and isinstance(out["bowling"]["here"].get(k), dict):
                out["bowling"]["here"][k]["share_of_wickets"] = keep_bowling[k].get("share_of_wickets")
    if hist:
        out["history"].update(keep_hist)
    return out


def _scramble_names(o, rng):
    """Player lists inside a venue file: first TEASER_SHARE real, the rest with hidden names and shuffled numbers."""
    if isinstance(o, dict):
        return {k: _scramble_names(v, rng) for k, v in o.items()}
    if isinstance(o, list) and o and all(isinstance(x, dict) and "name" in x for x in o):
        k = _n_real(len(o))
        tail = o[k:]
        for x in tail:
            x["name"] = MASK
            if "id" in x:
                x["id"] = "x"
        _shuffle_numbers(tail, rng)
        return o[:k] + tail
    return o


# ── locking files ────────────────────────────────────────────────────────────────────────────────────────────────

def lock_match(doc: dict, secret: str) -> dict:
    if doc.get("locked"):
        return doc
    mid = doc["match"]["id"]
    full = {"summary": doc["summary"], "fantasy": doc.get("fantasy"), "insights": doc.get("insights") or []}
    public = {k: v for k, v in doc.items() if k not in ("summary", "fantasy", "insights")}
    return {**public, "summary": overview_summary(doc["summary"]), "fantasy": overview_fantasy(doc.get("fantasy")),
            "insights": [i for i in (doc.get("insights") or []) if i.get("kind") == "result"][:1],
            "teaser": teaser(doc, f"{mid}:{doc.get('generated_at')}"), "masked": True,
            "locked": encrypt(full, key_for(secret, mid))}


def lock_venue(v: dict, match_id: str, secret: str) -> dict:
    if v.get("locked"):
        return v
    return {**teaser_venue(v, match_id), "masked": True, "locked": encrypt(v, key_for(secret, match_id))}


OPEN_AFTER_DAYS = 2      # a match is locked until two days after its date; then its forecast is open (results are public)


def lock_dir(data: Path, secret: str | None, today: str | None = None) -> tuple[int, int]:
    """Lock upcoming matches (and their venue files). Without a secret (locking not switched on yet), only add the
    teaser to each upcoming match, so the Pro tabs already show it; the files stay otherwise as they are."""
    from datetime import date, timedelta
    cutoff = (date.fromisoformat(today) if today else date.today()) - timedelta(days=OPEN_AFTER_DAYS)
    nm = nv = 0
    locked_ids: set = set()
    for f in sorted((data / "matches").glob("*.json")):
        if f.name.endswith(".pack.json"):
            continue
        d = json.loads(f.read_text())
        day = (d.get("match") or {}).get("date") or ""
        if day and day < cutoff.isoformat():
            continue                                          # finished a while ago: stays open
        locked_ids.add(f.stem)
        if d.get("summary") and not d.get("locked"):
            out = lock_match(d, secret) if secret else {**d, "teaser": teaser(d, f"{f.stem}:{d.get('generated_at')}")}
            f.write_text(json.dumps(out, separators=(",", ":")))
            nm += 1
    for f in sorted((data / "venue").glob("*.json")) if secret and (data / "venue").exists() else []:
        if f.stem not in locked_ids:
            continue
        d = json.loads(f.read_text())
        if not d.get("locked"):
            f.write_text(json.dumps(lock_venue(d, f.stem, secret), separators=(",", ":")))
            nv += 1
    return nm, nv


@click.command()
@click.option("--data", type=click.Path(exists=True, path_type=Path), required=True, help="the built site's data folder")
def main(data: Path) -> None:
    secret = os.environ.get("PRO_DATA_KEY", "") if os.environ.get("PRO_LOCK") == "true" else ""
    nm, nv = lock_dir(data, secret or None)
    click.echo(f"Locked {nm} match file(s) and {nv} venue file(s)" if secret
               else f"Locking is off (PRO_LOCK and PRO_DATA_KEY): added the teaser to {nm} match file(s)")


if __name__ == "__main__":
    main()
