"use client";
// Pick an endpoint, set its inputs, run it. With an API key the request goes to the live API; without one the
// playground shows the recorded sample response for the example inputs.
import { useEffect, useMemo, useState } from "react";
import { API, CATEGORIES, ENDPOINTS, EXAMPLES, Json, Svg, curl, describe, type Endpoint } from "@/lib/apiref";

type Result = { status: number; ms: number | null; mode: "sample" | "live"; body: unknown; svg?: string; error?: string };

function initial(ep: Endpoint): { values: Record<string, string>; body: string } {
  const ex = EXAMPLES[ep.id];
  const values: Record<string, string> = {};
  for (const p of ep.params) {
    let v: unknown = ex?.query?.[p.name];
    if (v === undefined && p.in === "path" && ex) {
      const re = new RegExp("^" + ep.path.replace(/[.]/g, "\\.").replace(/\{[^}]+\}/g, "([^/]+)") + "$");
      const names = [...ep.path.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]);
      const hit = ex.path.match(re);
      if (hit) v = decodeURIComponent(hit[names.indexOf(p.name) + 1]);
    }
    values[p.name] = v !== undefined && v !== null ? String(v) : p.default !== undefined ? String(p.default) : "";
  }
  return { values, body: ep.body ? JSON.stringify(ex?.body ?? {}, null, 2) : "" };
}

function buildUrl(ep: Endpoint, values: Record<string, string>): string {
  let path = ep.path;
  const q = new URLSearchParams();
  for (const p of ep.params) {
    const v = values[p.name];
    if (p.in === "path") path = path.replace(`{${p.name}}`, encodeURIComponent(v || `{${p.name}}`));
    else if (v !== "" && v !== undefined && String(p.default ?? "") !== v) q.set(p.name, v);
  }
  const qs = q.toString();
  return `${API}${path}${qs ? `?${qs}` : ""}`;
}

export default function Playground() {
  const [id, setId] = useState(ENDPOINTS[0].id);
  const ep = useMemo(() => ENDPOINTS.find((e) => e.id === id) ?? ENDPOINTS[0], [id]);
  const [values, setValues] = useState<Record<string, string>>(() => initial(ENDPOINTS[0]).values);
  const [body, setBody] = useState(() => initial(ENDPOINTS[0]).body);
  const [key, setKey] = useState("");
  const [res, setRes] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState("");

  useEffect(() => {
    try { setKey(localStorage.getItem("cs-api-key") ?? ""); } catch {}
    const h = decodeURIComponent(window.location.hash.slice(1));
    if (h && ENDPOINTS.some((e) => e.id === h)) select(h);
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  function select(next: string) {
    const e = ENDPOINTS.find((x) => x.id === next)!;
    const init = initial(e);
    setId(next); setValues(init.values); setBody(init.body); setRes(null);
    try { history.replaceState(null, "", `#${next}`); } catch {}
  }
  function saveKey(k: string) {
    setKey(k);
    try { k ? localStorage.setItem("cs-api-key", k) : localStorage.removeItem("cs-api-key"); } catch {}
  }

  const url = buildUrl(ep, values);
  let parsed: unknown = undefined;
  let bodyError = "";
  if (ep.body) {
    try { parsed = JSON.parse(body || "{}"); } catch (e) { bodyError = String(e); }
  }

  async function run() {
    if (bodyError) { setRes({ status: 422, ms: null, mode: "live", body: { detail: `Invalid JSON: ${bodyError}` } }); return; }
    setBusy(true);
    if (!key) {
      const ex = EXAMPLES[ep.id];
      await new Promise((r) => setTimeout(r, 250));
      setRes(ex ? { status: ex.status, ms: null, mode: "sample", body: ep.returns === "svg" ? null : ex.response,
                    svg: ep.returns === "svg" ? String(ex.response) : undefined }
                : { status: 404, ms: null, mode: "sample", body: { detail: "No sample for this endpoint" } });
      setBusy(false);
      return;
    }
    const t0 = performance.now();
    try {
      const r = await fetch(url, { method: ep.method, headers: { "X-API-Key": key, ...(ep.body ? { "Content-Type": "application/json" } : {}) },
                                   body: ep.body ? JSON.stringify(parsed) : undefined });
      const ms = Math.round(performance.now() - t0);
      const ct = r.headers.get("content-type") ?? "";
      if (ct.includes("svg")) setRes({ status: r.status, ms, mode: "live", body: null, svg: await r.text() });
      else setRes({ status: r.status, ms, mode: "live", body: await r.json().catch(() => null) });
    } catch (e) {
      setRes({ status: 0, ms: null, mode: "live", body: null, error: `Couldn't reach ${API}. ${String(e)}` });
    }
    setBusy(false);
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") run(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const copy = (what: string, text: string) => {
    navigator.clipboard?.writeText(text).then(() => { setCopied(what); setTimeout(() => setCopied(""), 1200); });
  };
  const curlText = curl(ep, url, ep.body ? parsed : undefined, key || "cs_live_your_key");
  const respText = res?.svg ?? (res ? JSON.stringify(res.body, null, 2) : "");

  return (
    <div className="bleed">
      <div id="pg-page-header" style={{ padding: "1.25rem 2rem", borderBottom: "1px solid var(--color-border)", background: "var(--color-bg-secondary)" }}>
        <div style={{ maxWidth: 1400, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
          <div>
            <p className="cs-eyebrow" style={{ marginBottom: 2 }}>Interactive</p>
            <h1 style={{ fontFamily: "var(--font-display)", fontSize: "1.35rem", fontWeight: 700, margin: 0 }}>API Playground</h1>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <span className="small muted">Press</span>
            <kbd style={{ fontFamily: "var(--cs-mono)", fontSize: "0.7rem", padding: "2px 7px", border: "1px solid var(--color-border)" }}>⌘ Enter</kbd>
            <span className="small muted">to run</span>
            <a href={`/docs/#${ep.id}`} className="btn ghost" style={{ fontSize: 13, padding: "6px 14px" }}>View docs →</a>
          </div>
        </div>
      </div>

      <div className="pg-layout">
        <aside className="pg-sidebar">
          <div className={`pg-mode-banner ${key ? "live" : "demo"}`}>
            <span className="pg-mode-dot" />{key ? "Live: requests go to the API" : "Sample mode: recorded responses"}
          </div>
          <div className="pg-key-wrap">
            <label className="pg-key-label" htmlFor="pg-key-input">API key</label>
            <div className="pg-key-row">
              <input id="pg-key-input" className="pg-key-input" type="text" value={key} placeholder="cs_live_…" autoComplete="off"
                     spellCheck={false} onChange={(e) => saveKey(e.target.value.trim())} />
              <button className="pg-key-clear" onClick={() => saveKey("")}>clear</button>
            </div>
            <p style={{ fontSize: "0.68rem", color: "var(--color-text-muted)", marginTop: "0.3rem" }}>
              No key? Run any endpoint to see a sample response. <a href="/developers/#request-access">Request a key →</a>
            </p>
          </div>
          {CATEGORIES.map((c) => {
            const eps = ENDPOINTS.filter((e) => e.category === c);
            return (
              <details key={c} className="pg-product-group" open>
                <summary className="pg-product-summary">
                  <span className="pg-product-dot pg-product-dot--live" />
                  <span className="pg-product-name">{c}</span>
                  <span className="pg-product-badge pg-product-badge--live">{eps.length}</span>
                  <svg className="pg-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9" /></svg>
                </summary>
                <div className="pg-product-body">
                  <ul className="pg-ep-list">
                    {eps.map((e) => (
                      <li key={e.id}>
                        <button className={`pg-ep-btn${e.id === id ? " active" : ""}`} onClick={() => select(e.id)} title={e.summary}>
                          <span className="pg-ep-method">{e.method}</span><span className="pg-ep-path">{e.summary}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              </details>
            );
          })}
        </aside>

        <div className="pg-main">
          <div className="pg-block">
            <div className="pg-block-header">
              <span className="pg-block-title">{ep.summary}</span>
              <span className="mono small muted">{ep.method} {ep.path}</span>
            </div>
            <div className="pg-block-body"><p className="small" style={{ margin: 0 }}>{ep.description}</p></div>
          </div>

          <div className="pg-params-bar">
            <div className="pg-params-inline">
              {ep.params.length === 0 && <span className="small muted">No parameters</span>}
              {ep.params.map((p) => (
                <div key={p.name} className="pg-param-group" title={describe(p)}>
                  <label className="pg-param-label" htmlFor={`pp-${p.name}`}>
                    {p.name}{p.required && " *"} <span className="pg-param-type">{p.in === "path" ? "path" : p.type}</span>
                  </label>
                  {p.enum ? (
                    <select id={`pp-${p.name}`} className="pg-param-select" value={values[p.name] ?? ""}
                            onChange={(e) => setValues({ ...values, [p.name]: e.target.value })}>
                      {!p.required && p.default === undefined && <option value="">—</option>}
                      {p.enum.map((v) => <option key={String(v)} value={String(v)}>{String(v)}</option>)}
                    </select>
                  ) : (
                    <input id={`pp-${p.name}`} className="pg-param-input" value={values[p.name] ?? ""} spellCheck={false}
                           onChange={(e) => setValues({ ...values, [p.name]: e.target.value })} />
                  )}
                </div>
              ))}
            </div>
            <button className="pg-run-btn-inline" onClick={run} disabled={busy}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3" /></svg>
              {busy ? "Running…" : "Run"}
            </button>
          </div>

          {ep.body && (
            <div className="pg-block">
              <div className="pg-block-header"><span className="pg-block-title">JSON body</span>
                {bodyError && <span className="small" style={{ color: "var(--cs-danger)" }}>Invalid JSON</span>}</div>
              <div className="pg-block-body">
                <textarea className="pg-body-input form-input" spellCheck={false} value={body} onChange={(e) => setBody(e.target.value)} />
              </div>
            </div>
          )}

          <div className="pg-block">
            <div className="pg-block-header">
              <span className="pg-block-title">curl</span>
              <button className="pg-copy-btn" onClick={() => copy("curl", curlText)}>{copied === "curl" ? "Copied" : "Copy"}</button>
            </div>
            <div className="pg-block-body"><pre className="pg-curl-pre">{curlText}</pre></div>
          </div>

          <div className="pg-block" style={{ flex: 1, display: "flex", flexDirection: "column", borderBottom: "none" }}>
            <div className="pg-block-header">
              <span className="pg-block-title">Response</span>
              <button className="pg-copy-btn" onClick={() => copy("resp", respText)} disabled={!res}>{copied === "resp" ? "Copied" : "Copy"}</button>
            </div>
            <div className="pg-status-bar">
              {res && (<>
                <span className={`pg-status-badge ${res.status === 200 ? "ok" : "err"}`}>{res.status || "ERR"}</span>
                <span className="pg-status-mode">{res.mode === "sample" ? "Sample response for the example inputs" : "Live"}</span>
                {res.ms !== null && <span className="pg-status-latency">{res.ms} ms</span>}
              </>)}
            </div>
            <div className="pg-response-body">
              {!res && <div className="pg-empty">Press Run to send the request.</div>}
              {res?.error && <div className="pg-error-card">{res.error}</div>}
              {res?.svg && <Svg markup={res.svg} />}
              {res && !res.svg && !res.error && <div className="pg-json code-panel active"><Json value={res.body} /></div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
