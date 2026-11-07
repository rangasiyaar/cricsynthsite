"""Public API reference for the website's /docs and /playground pages, generated from the OpenAPI schema.

    uv run python -m cricapi.reference > app/data-static/api-reference.json

Admin routes and auth headers are left out. A test keeps the committed file in step with the API.
"""
from __future__ import annotations

import json

CATEGORIES = ("Analytics", "Simulation & modelling", "Graphics")

# The hosted API (Cloudflare Worker, edge/) answers most endpoints as they are; these take a covered match's
# match_id (answers prepared in Actions) with only the listed options, and these three stay local (the MCP server's
# engine, MatchSynth Lab). Simulation counts aren't a parameter of the hosted API.
PREPARED = {
    "POST /v1/par-score": [], "POST /v1/toss": [], "POST /v1/players/{pid}/impact": [],
    "POST /v1/players/{pid}/projection": [], "POST /v1/fantasy/projections": [],
    "POST /v1/chase-curve": ["chasing", "target_from", "target_to", "step"],
    "POST /v1/lineups/batting-order": ["team"], "POST /v1/lineups/bowling-plan": ["bowling_team"],
    "POST /v1/fantasy/team": ["captain_rule"], "POST /v1/fantasy/portfolio": ["teams_count"],
    "POST /v1/win-probability": ["state"], "POST /v1/innings/projection": ["state", "thresholds"],
}
LOCAL = {"POST /v1/simulate", "POST /v1/scenarios/compare", "POST /v1/lineups/swap"}
MATCH_ID = {"name": "match_id", "type": "string", "required": True,
            "description": "A covered match (from /v1/matches); its answers are prepared from 3 days before the start"}


def hosted(ep: dict) -> dict:
    """The endpoint as the hosted API serves it."""
    key = f"{ep['method']} {ep['path']}"
    ep = {**ep, "params": [p for p in ep["params"] if p["name"] != "n"]}
    if ep["body"]:
        ep["body"] = [f for f in ep["body"] if f["name"] != "n"]
    if key in LOCAL:
        return {**ep, "hosted": "local"}
    if key == "GET /v1/matches/{match_id}/win-probability":
        return {**ep, "hosted": "covered"}
    if key in PREPARED:
        keep = PREPARED[key]
        body = [MATCH_ID] + [f for f in (ep["body"] or []) if f["name"] in keep]
        return {**ep, "hosted": "covered", "body": body}
    return {**ep, "hosted": "yes"}


def _resolve(s: dict, schemas: dict) -> dict:
    return schemas[s["$ref"].rsplit("/", 1)[-1]] if "$ref" in s else s


def _type(s: dict, schemas: dict) -> str:
    if "$ref" in s:
        r = schemas.get(s["$ref"].rsplit("/", 1)[-1], {})
        return "enum" if "enum" in r else "object"
    if "anyOf" in s:
        return " | ".join(t for t in (_type(x, schemas) for x in s["anyOf"]) if t != "null") or "any"
    if "enum" in s or "const" in s:
        return "enum"
    if s.get("type") == "array":
        return f"{_type(s.get('items', {}), schemas)}[]"
    if s.get("type") == "object":
        return "object"
    return s.get("type", "any")


def _enum(s: dict, schemas: dict) -> list | None:
    for x in [s, *s.get("anyOf", [])]:
        x = _resolve(x, schemas)
        if "enum" in x:
            return x["enum"]
        if "const" in x:
            return [x["const"]]
    return None


def _fields(name: str, schemas: dict, seen: frozenset = frozenset()) -> list[dict]:
    if name in seen or name not in schemas:
        return []
    sc = schemas[name]
    req = set(sc.get("required", []))
    out = []
    for f, p in sc.get("properties", {}).items():
        row = {"name": f, "type": _type(p, schemas), "required": f in req, "description": p.get("description", "")}
        if p.get("default") is not None:
            row["default"] = p["default"]
        e = _enum(p, schemas)
        if e:
            row["enum"] = e
        refs = [x["$ref"].rsplit("/", 1)[-1] for x in [p, p.get("items", {}), *p.get("anyOf", [])] if "$ref" in x]
        if refs and "enum" not in schemas.get(refs[0], {}):
            row["fields"] = _fields(refs[0], schemas, seen | {name})
        out.append(row)
    return out


def build() -> dict:
    from cricapi.main import app
    spec = app.openapi()
    schemas = spec.get("components", {}).get("schemas", {})
    endpoints = []
    for path, ops in spec["paths"].items():
        for method, op in ops.items():
            tag = (op.get("tags") or [None])[0]
            if tag not in CATEGORIES:
                continue
            params = []
            for p in op.get("parameters", []):
                if p["in"] not in ("path", "query"):
                    continue
                s = p.get("schema", {})
                row = {"name": p["name"], "in": p["in"], "type": _type(s, schemas), "required": p.get("required", False),
                       "description": p.get("description", "") or s.get("description", "")}
                if s.get("default") is not None:
                    row["default"] = s["default"]
                e = _enum(s, schemas)
                if e:
                    row["enum"] = e
                params.append(row)
            ref = op.get("requestBody", {}).get("content", {}).get("application/json", {}).get("schema", {}).get("$ref")
            endpoints.append({"id": f"{method}-{path}".lower().replace("/", "-").replace("{", "").replace("}", "")
                              .replace(".", "-").replace("--", "-").strip("-"),
                              "category": tag, "method": method.upper(), "path": path, "summary": op.get("summary", ""),
                              "description": " ".join((op.get("description") or "").split()),
                              "returns": "svg" if path.endswith(".svg") else "json",
                              "params": params, "body": _fields(ref.rsplit("/", 1)[-1], schemas) if ref else None})
    order = {c: i for i, c in enumerate(CATEGORIES)}
    endpoints = [hosted(e) for e in sorted(endpoints, key=lambda e: order[e["category"]])]
    return {"title": spec["info"]["title"], "version": spec["info"]["version"], "categories": list(CATEGORIES),
            "endpoints": endpoints}


if __name__ == "__main__":
    print(json.dumps(build(), indent=1))
