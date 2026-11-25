"use client";
// Docs home body: a search across every doc page, then two tabs of link cards. "CricSynthesis platform" (for fans)
// links to each Guide topic; "CricSynthesis for developers" links to the API reference, playground, MCP and plans.
// The open tab follows the address (#platform / #developers). Old API anchors (/docs/#match-forecast) go to the
// API reference.
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

export type DocsData = {
  guide: { group: string; pages: { href: string; title: string; short: string; pro: boolean; group: string }[] }[];
  api: { name: string; count: number; href: string; endpoints: { href: string; method: string; path: string; summary: string }[] }[];
};

type Tab = "platform" | "developers";
const TABS: [Tab, string][] = [["platform", "CricSynthesis platform"], ["developers", "CricSynthesis for developers"]];

const Arrow = () => (
  <svg className="dh-arrow" viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3.5L10.5 8 6 12.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
);

function Card({ href, title, text, tag, big, label }: { href: string; title: string; text: string; tag?: string; big?: boolean; label?: string }) {
  return (
    <Link href={href} className={`dh-card${big ? " dh-card-big" : ""}`}>
      {label && <span className="cs-k">{label}</span>}
      <span className="dh-card-title">{title}{tag && <span className={`tag${tag === "Pro" ? " pro" : ""}`}>{tag}</span>}<Arrow /></span>
      <span className="dh-card-text">{text}</span>
    </Link>
  );
}

const CAT_TEXT: Record<string, string> = {
  "Analytics": "Players, grounds, teams and competitions: ratings, splits, match-ups and trends.",
  "Simulation & modelling": "Match forecasts, win chance from any score, par, chases, toss and fantasy.",
  "Graphics": "Ready-to-share cards for matches, players, match-ups and grounds.",
};

const MATCH_PAGE = ["The match", "The players", "The ground", "Fantasy"];

function Platform({ data }: { data: DocsData }) {
  const pages = (groups: string[]) => data.guide.filter((g) => groups.includes(g.group)).flatMap((g) => g.pages);
  const start = pages(["Start here"]);
  return (
    <>
      <div className="dh-grid dh-grid-3">
        <Card big href="/docs/guide/" title="Read the full guide" text="Every section of a match page explained, top to bottom, in one document." />
        {start.map((p) => <Card big key={p.href} href={p.href} title={p.title} text={p.short} />)}
      </div>

      <section className="dh-group">
        <h2 className="dh-group-title">The match page, section by section</h2>
        <div className="dh-grid">
          {pages(MATCH_PAGE).map((p) => <Card key={p.href} href={p.href} label={p.group} title={p.title} text={p.short} tag={p.pro ? "Pro" : undefined} />)}
        </div>
      </section>

      <section className="dh-group">
        <h2 className="dh-group-title">Tools</h2>
        <div className="dh-grid">
          <Card href="/matches/" title="Matches" text="Today's games, upcoming fixtures and results." />
          {pages(["Tools"]).map((p) => <Card key={p.href} href={p.href} title={p.title} text={p.short} tag={p.pro ? "Pro" : undefined} />)}
        </div>
      </section>

      <section className="dh-group">
        <h2 className="dh-group-title">Quick guides</h2>
        <div className="dh-grid">
          {pages(["Quick guides"]).map((p) => <Card key={p.href} href={p.href} title={p.title} text={p.short} tag={p.pro ? "Pro" : undefined} />)}
        </div>
      </section>

      <section className="dh-group">
        <h2 className="dh-group-title">More help</h2>
        <div className="dh-grid">
          <Card href="/app/" title="Android app" text="Every match page on your phone." />
          <Card href="/pricing/" title="Pricing" text="CricSynthesis Pro by the month or the year." />
          <Card href="/about/" title="About us" text="Who we are and why we built CricSynthesis." />
          <Card href="/contact/" title="Contact us" text="Questions, feedback or a problem with your account." />
        </div>
      </section>
    </>
  );
}

function Developers({ data }: { data: DocsData }) {
  return (
    <>
      <div className="dh-grid dh-grid-3">
        <Card big href="/docs/api/#overview" title="Quickstart" text="Get a key and make your first call in a couple of minutes." />
        <Card big href="/docs/api/" title="API reference" text="Every endpoint with its options and a sample answer." />
        <Card big href="/mcp/" title="MCP connector" text="Use CricSynthesis inside Claude and other AI assistants." />
      </div>

      <section className="dh-group">
        <h2 className="dh-group-title">Endpoints</h2>
        <div className="dh-grid dh-grid-3">
          {data.api.map((c) => (
            <div key={c.name} className="dh-card dh-cat">
              <Link href={c.href} className="dh-card-title">{c.name}<span className="dh-count">{c.count}</span><Arrow /></Link>
              <span className="dh-card-text">{CAT_TEXT[c.name] ?? ""}</span>
              <ul className="dh-eps">
                {c.endpoints.slice(0, 5).map((e) => (
                  <li key={e.href}><Link href={e.href}><span className={`method-badge${e.method === "POST" ? " is-post" : ""}`}>{e.method}</span>{e.summary}</Link></li>
                ))}
              </ul>
              {c.count > 5 && <Link href={c.href} className="dh-all">All {c.count} endpoints</Link>}
            </div>
          ))}
        </div>
      </section>

      <section className="dh-group">
        <h2 className="dh-group-title">Essentials</h2>
        <div className="dh-grid dh-grid-3">
          <Card href="/docs/api/#authentication" title="Authentication" text="Send your key in the X-API-Key header." />
          <Card href="/docs/api/#rate-limits" title="Rate limits" text="Daily calls by plan, and what happens at the limit." />
          <Card href="/docs/api/#errors" title="Errors" text="What each error code means." />
          <Card href="/account/" title="API keys" text="Create and revoke keys from your account." />
          <Card href="/playground/" title="Playground" text="Try any endpoint in the browser, no code needed." />
          <Card href="/developers/#plans" title="Plans" text="Free, Plus and Business, side by side." />
        </div>
      </section>

      <section className="dh-group">
        <h2 className="dh-group-title">First call</h2>
        <pre className="docs-code dh-code">{`curl "https://api.cricsynthesis.in/v1/matches" \\\n  -H "X-API-Key: cs_live_…"`}</pre>
        <p className="dh-note">Questions or a bigger project? <Link href="/contact/">Talk to us</Link>.</p>
      </section>
    </>
  );
}

type Hit = { href: string; title: string; where: string };

function Search({ data }: { data: DocsData }) {
  const [q, setQ] = useState("");
  const all = useMemo<(Hit & { hay: string })[]>(() => [
    ...data.guide.flatMap((g) => g.pages.map((p) => ({ href: p.href, title: p.title, where: `Guide · ${g.group}`, hay: `${p.title} ${p.short} ${g.group}` }))),
    ...data.api.flatMap((c) => c.endpoints.map((e) => ({ href: e.href, title: e.summary, where: `API · ${e.method} ${e.path}`, hay: `${e.summary} ${e.path} ${c.name}` }))),
    { href: "/mcp/", title: "MCP connector", where: "Developers", hay: "mcp connector claude assistant ai" },
    { href: "/playground/", title: "Playground", where: "Developers", hay: "playground try endpoint" },
    { href: "/developers/#plans", title: "API plans", where: "Developers", hay: "plans pricing free plus business limits" },
    { href: "/lab/", title: "MatchSynth Lab", where: "Tools", hay: "lab matchsynth what if scenario" },
  ], [data]);
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const hits = words.length ? all.filter((h) => words.every((w) => h.hay.toLowerCase().includes(w))).slice(0, 8) : [];
  return (
    <div className="dh-search">
      <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
      <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the docs: win chance, fantasy, player rating…"
             aria-label="Search the docs" onKeyDown={(e) => { if (e.key === "Enter" && hits[0]) window.location.href = hits[0].href; }} />
      {words.length > 0 && (
        <div className="dh-results" role="listbox">
          {hits.length ? hits.map((h) => (
            <Link key={h.href + h.title} href={h.href} role="option" aria-selected={false}><b>{h.title}</b><span>{h.where}</span></Link>
          )) : <p>Nothing found. Try the <Link href="/docs/guide/">full guide</Link>.</p>}
        </div>
      )}
    </div>
  );
}

export default function DocsTabs({ data }: { data: DocsData }) {
  const [tab, setTab] = useState<Tab>("platform");
  useEffect(() => {
    const read = () => {
      const h = window.location.hash.slice(1);
      if (h === "platform" || h === "developers") setTab(h);
      else if (h) window.location.replace(`/docs/api/#${h}`);        // an old API reference anchor
    };
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);
  const choose = (t: Tab) => { setTab(t); history.replaceState(null, "", `#${t}`); };

  return (
    <>
      <Search data={data} />
      <div className="tabs docs-tabs" role="tablist" aria-label="Who it's for">
        {TABS.map(([t, label]) => (
          <button key={t} role="tab" id={`tab-${t}`} aria-selected={tab === t} aria-controls={`panel-${t}`} onClick={() => choose(t)}>{label}</button>
        ))}
      </div>
      <section role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="dh-panel">
        {tab === "platform" ? <Platform data={data} /> : <Developers data={data} />}
      </section>
    </>
  );
}
