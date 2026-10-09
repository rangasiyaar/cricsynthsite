"use client";
import { useState } from "react";
import { API, CATEGORIES, ENDPOINTS, EXAMPLES, Json, Svg, curl, describe, urlFor, type Endpoint, type Field } from "@/lib/apiref";

const PLANS = [
  ["Free", "200", "2,000", "Watermarked graphics"],
  ["Pro", "5,000", "20,000", "Clean graphics"],
  ["Business", "50,000", "50,000", "Priority support"],
];
const ERRORS = [
  ["401", "Missing or invalid API key"], ["404", "Unknown player, venue, team, competition or match"],
  ["422", "Invalid parameters or body; the detail names the field"], ["429", "Daily request limit reached for your plan"],
  ["500", "Server error"],
];

function flat(rows: Field[], prefix = ""): (Field & { label: string })[] {
  return rows.flatMap((f) => [{ ...f, label: prefix + f.name },
    ...(f.fields ? flat(f.fields, `${prefix}${f.name}${f.type.endsWith("[]") ? "[]" : ""}.`) : [])]);
}

function Params({ rows, title }: { rows: (Field & { label?: string; in?: string })[]; title: string }) {
  if (!rows.length) return null;
  return (
    <>
      <p className="response-label">{title}</p>
      <table className="params-table">
        <thead><tr><th>Name</th><th>Type</th><th>Required</th><th>Description</th></tr></thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.label ?? p.name}>
              <td className="param-name">{p.label ?? p.name}</td>
              <td className="param-type">{p.type}{p.in === "path" ? " · path" : ""}</td>
              <td className={p.required ? "param-required" : "param-optional"}>{p.required ? "required" : "optional"}</td>
              <td className="param-desc">
                {describe(p)}
                {p.enum && <span className="param-enum"> {p.enum.map((v) => <code key={String(v)}>{String(v)}</code>)}</span>}
                {p.default !== undefined && p.default !== "" && <> Default <code>{JSON.stringify(p.default)}</code>.</>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function EndpointSection({ ep }: { ep: Endpoint }) {
  const ex = EXAMPLES[ep.id];
  return (
    <section id={ep.id} className="docs-section">
      <h2 className="docs-section-title">{ep.summary}</h2>
      <details className="endpoint-card" open>
        <summary className="endpoint-header">
          <span className={ep.method === "GET" ? "method-get" : "method-post"}>{ep.method}</span>
          <span className="endpoint-path">{ep.path}</span>
        </summary>
        <div className="endpoint-body">
          <p>{ep.description}</p>
          <Params rows={ep.params} title="Parameters" />
          {ep.body && <Params rows={flat(ep.body)} title="JSON body" />}
          {ex && (<>
            <p className="response-label">Example request</p>
            <div className="code-panel active"><pre>{curl(ep, urlFor(ex, ep), ex.body ?? undefined)}</pre></div>
            <p className="response-label">Example response{ep.returns === "svg" ? " (image/svg+xml)" : ""}</p>
            <div className="code-panel active">
              {ep.returns === "svg" && typeof ex.response === "string" ? <Svg markup={ex.response} /> : <Json value={ex.response} />}
            </div>
          </>)}
          <p className="small" style={{ marginTop: 12 }}><a href={`/playground/#${ep.id}`}>Try it in the playground →</a></p>
        </div>
      </details>
    </section>
  );
}

export default function Docs() {
  const [open, setOpen] = useState(false);
  return (
    <div className="bleed">
      <div className="docs-layout">
        <button className={`docs-sidebar-toggle${open ? " open" : ""}`} aria-expanded={open} onClick={() => setOpen(!open)}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" /></svg>
          API Reference
        </button>
        <aside className={`docs-sidebar${open ? " open" : ""}`} onClick={() => setOpen(false)}>
          <details className="sidebar-product-group" open>
            <summary className="sidebar-product-summary">
              <span className="sidebar-product-name">Getting started</span>
              <svg className="sidebar-chevron" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9" /></svg>
            </summary>
            <ul className="sidebar-nav">
              <li><a href="#overview">Overview</a></li>
              <li><a href="#authentication">Authentication</a></li>
              <li><a href="#rate-limits">Rate limits</a></li>
              <li><a href="#errors">Errors</a></li>
            </ul>
          </details>
          {CATEGORIES.map((c) => {
            const eps = ENDPOINTS.filter((e) => e.category === c);
            return (
              <details key={c} className="sidebar-product-group" open>
                <summary className="sidebar-product-summary">
                  <span className="sidebar-product-dot sidebar-product-dot--live" />
                  <span className="sidebar-product-name">{c}</span>
                  <span className="sidebar-product-badge sidebar-product-badge--live">{eps.length}</span>
                  <svg className="sidebar-chevron" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9" /></svg>
                </summary>
                <ul className="sidebar-nav">
                  {eps.map((e) => (
                    <li key={e.id}><a href={`#${e.id}`}><span className={`method-badge${e.method === "POST" ? " post" : ""}`}>{e.method}</span> {e.path.replace("/v1", "")}</a></li>
                  ))}
                </ul>
              </details>
            );
          })}
        </aside>

        <main className="docs-main">
          <section id="overview" className="docs-section">
            <h1 className="docs-section-title" style={{ fontSize: "2rem" }}>CricSynthesis API</h1>
            <p className="docs-section-desc">
              {ENDPOINTS.length} endpoints in three groups. <b>Analytics</b> reads the ball-by-ball model directly: player
              profiles by phase, bowling type and situation, rankings, match-ups, venues, competitions, teams and scoring
              trends. <b>Simulation &amp; modelling</b> plays matches out ball by ball: win probability from any state,
              projections, par scores, chase curves, toss calls, lineup and scenario comparisons, and fantasy projections.
              <b> Graphics</b> returns share-ready SVG cards. Base URL <code>{API}</code>.
            </p>
          </section>
          <section id="authentication" className="docs-section">
            <h2 className="docs-section-title">Authentication</h2>
            <p className="docs-section-desc">Send your key in the <code>X-API-Key</code> header (or <code>Authorization: Bearer</code>).
              Keys are issued on request: <a href="/developers/#request-access">request access</a>.</p>
            <div className="code-panel active"><pre>{`curl "${API}/v1/players?q=kohli" \\\n  -H "X-API-Key: cs_live_your_key"`}</pre></div>
          </section>
          <section id="rate-limits" className="docs-section">
            <h2 className="docs-section-title">Rate limits</h2>
            <table className="params-table">
              <thead><tr><th>Plan</th><th>Requests / day</th><th>Simulations / request</th><th>Notes</th></tr></thead>
              <tbody>{PLANS.map((p) => <tr key={p[0]}>{p.map((x, i) => <td key={i} className={i ? "param-desc" : "param-name"}>{x}</td>)}</tr>)}</tbody>
            </table>
          </section>
          <section id="errors" className="docs-section">
            <h2 className="docs-section-title">Errors</h2>
            <table className="params-table">
              <thead><tr><th>Status</th><th>Meaning</th></tr></thead>
              <tbody>{ERRORS.map(([c, m]) => <tr key={c}><td className="param-name">{c}</td><td className="param-desc">{m}</td></tr>)}</tbody>
            </table>
          </section>
          {CATEGORIES.map((c) => (
            <div key={c}>
              <p className="cs-eyebrow" style={{ marginTop: 24 }}>{c}</p>
              {ENDPOINTS.filter((e) => e.category === c).map((e) => <EndpointSection key={e.id} ep={e} />)}
            </div>
          ))}
        </main>
      </div>
    </div>
  );
}
