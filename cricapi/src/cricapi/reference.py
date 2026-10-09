"""Public API reference for the website's /docs and /playground pages, generated from the OpenAPI schema.

    uv run python -m cricapi.reference > app/data-static/api-reference.json

Admin routes and auth headers are left out. A test keeps the committed file in step with the API.
"""
from __future__ import annotations

import json

CATEGORIES = ("Analytics", "Simulation & modelling", "Graphics")


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
    endpoints.sort(key=lambda e: order[e["category"]])
    return {"title": spec["info"]["title"], "version": spec["info"]["version"], "categories": list(CATEGORIES),
            "endpoints": endpoints}


if __name__ == "__main__":
    print(json.dumps(build(), indent=1))
