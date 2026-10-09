"""Public API reference for the website's /docs page, generated from the OpenAPI schema.

    uv run python -m cricapi.reference > app/data-static/api-reference.json

Admin routes and auth headers are left out. A test keeps the committed file in step with the API.
"""
from __future__ import annotations

import json


def _type(s: dict, schemas: dict) -> str:
    if "$ref" in s:
        return s["$ref"].rsplit("/", 1)[-1]
    if "anyOf" in s:
        return " | ".join(t for t in (_type(x, schemas) for x in s["anyOf"]) if t != "null") or "any"
    if "enum" in s:
        return " | ".join(json.dumps(v) for v in s["enum"])
    if s.get("type") == "array":
        return f"{_type(s.get('items', {}), schemas)}[]"
    return s.get("type", "any")


def _fields(name: str, schemas: dict, seen: set[str]) -> list[dict]:
    if name in seen or name not in schemas:
        return []
    seen = seen | {name}
    sc = schemas[name]
    req = set(sc.get("required", []))
    out = []
    for f, p in sc.get("properties", {}).items():
        row = {"name": f, "type": _type(p, schemas), "required": f in req, "description": p.get("description", "")}
        if "default" in p and p["default"] is not None:
            row["default"] = p["default"]
        refs = [x["$ref"].rsplit("/", 1)[-1] for x in [p, p.get("items", {}), *p.get("anyOf", [])] if "$ref" in x]
        if refs and refs[0] not in seen:
            row["fields"] = _fields(refs[0], schemas, seen)
        out.append(row)
    return out


def build() -> dict:
    from cricapi.main import app
    spec = app.openapi()
    schemas = spec.get("components", {}).get("schemas", {})
    endpoints = []
    for path, ops in spec["paths"].items():
        if path.startswith("/admin") or path in ("/health",):
            continue
        for method, op in ops.items():
            params = [{"name": p["name"], "in": p["in"], "type": _type(p.get("schema", {}), schemas),
                       "required": p.get("required", False), "description": p.get("description", "")}
                      for p in op.get("parameters", []) if p["in"] in ("path", "query")]
            body = None
            ref = (op.get("requestBody", {}).get("content", {}).get("application/json", {}).get("schema", {}).get("$ref"))
            if ref:
                body = _fields(ref.rsplit("/", 1)[-1], schemas, set())
            endpoints.append({"method": method.upper(), "path": path, "summary": op.get("summary", ""),
                              "description": (op.get("description") or "").strip(), "params": params, "body": body})
    return {"title": spec["info"]["title"], "version": spec["info"]["version"], "endpoints": endpoints}


if __name__ == "__main__":
    print(json.dumps(build(), indent=1))
