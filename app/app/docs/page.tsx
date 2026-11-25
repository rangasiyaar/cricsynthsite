// Docs home: how to use CricSynthesis. A search, then two lists side by side (stacked on phones): using the site and
// app (each Guide topic), and building with the API (reference, playground, MCP, plans). Plain link rows, no cards.
import type { Metadata } from "next";
import Link from "next/link";
import DocsSearch, { type SearchItem } from "@/components/DocsSearch";
import { GUIDE, guidePath } from "@/lib/guide";
import { CATEGORIES, ENDPOINTS } from "@/lib/apiref";
import { seo } from "@/lib/seo";

export const metadata: Metadata = seo("/docs/", "How to use CricSynthesis | Docs",
  "How to use CricSynthesis: what every number on a match page means, and how to build with the CricSynthesis API.");

type Row = { href: string; title: string; text: string; n?: number; sub?: { href: string; method: string; title: string }[] };

const guide = (groups: string[]): Row[] => GUIDE.filter((p) => groups.includes(p.group)).map((p) => ({ href: guidePath(p.slug), title: p.title, text: p.short }));
const CAT_TEXT: Record<string, string> = {
  "Analytics": "Players, grounds, teams and competitions: ratings, splits, match-ups and trends.",
  "Simulation & modelling": "Match forecasts, win chance from any score, par, chases, toss and fantasy.",
  "Graphics": "Ready-to-share cards for matches, players, match-ups and grounds.",
};

const USING: [string, Row[]][] = [
  ["Getting started", [{ href: "/docs/guide/", title: "Read the full guide", text: "Every section of a match page, top to bottom." }, ...guide(["Start here"])]],
  ["The match page", guide(["The match", "The players", "The ground", "Fantasy"])],
  ["Tools", guide(["Tools"])],
  ["Quick guides", guide(["Quick guides"])],
];

const BUILDING: [string, Row[]][] = [
  ["Getting started", [
    { href: "/docs/api/#overview", title: "Quickstart", text: "Get a key and make your first call." },
    { href: "/docs/api/#authentication", title: "Authentication", text: "Send your key in the X-API-Key header." },
    { href: "/docs/api/#rate-limits", title: "Rate limits", text: "Daily calls by plan, and what happens at the limit." },
    { href: "/docs/api/#errors", title: "Errors", text: "What each error code means." }]],
  ["API reference", CATEGORIES.map((c) => {
    const eps = ENDPOINTS.filter((e) => e.category === c);
    return { href: `/docs/api/#${eps[0]?.id ?? ""}`, title: c, text: CAT_TEXT[c] ?? "", n: eps.length,
      sub: eps.slice(0, 3).map((e) => ({ href: `/docs/api/#${e.id}`, method: e.method, title: e.summary })) };
  })],
  ["Tools", [
    { href: "/playground/", title: "Playground", text: "Try any endpoint in the browser, no code needed." },
    { href: "/mcp/", title: "MCP connector", text: "Use CricSynthesis inside Claude and other AI assistants." },
    { href: "/account/", title: "API keys", text: "Create and revoke keys from your account." }]],
  ["Plans and help", [
    { href: "/developers/#plans", title: "Plans", text: "Free, Plus and Business, side by side." },
    { href: "/contact/", title: "Talk to us", text: "Bigger projects and Business plans." }]],
];

const SEARCH: SearchItem[] = [
  ...GUIDE.map((p) => ({ href: guidePath(p.slug), title: p.title, where: `Guide · ${p.group}`, hay: `${p.title} ${p.short} ${p.group}`.toLowerCase() })),
  ...ENDPOINTS.map((e) => ({ href: `/docs/api/#${e.id}`, title: e.summary, where: `API · ${e.method} ${e.path}`, hay: `${e.summary} ${e.path} ${e.category}`.toLowerCase() })),
  ...BUILDING.flatMap(([, rows]) => rows.filter((r) => !r.n).map((r) => ({ href: r.href, title: r.title, where: "Developers", hay: `${r.title} ${r.text}`.toLowerCase() }))),
  { href: "/lab/", title: "MatchSynth Lab", where: "Tools", hay: "matchsynth lab what if scenario" },
];

function List({ id, label, title, text, start, groups }: { id: string; label: string; title: string; text: string; start: [string, string]; groups: [string, Row[]][] }) {
  return (
    <section id={id} className="dh-col" aria-labelledby={`${id}-h`}>
      <p className="cs-k">{label}</p>
      <h2 id={`${id}-h`}>{title}</h2>
      <p className="dh-intro">{text}</p>
      <Link className="dh-start" href={start[0]}>{start[1]} →</Link>
      {groups.map(([h, rows]) => (
        <div key={h} className="dh-group">
          <h3 className="cs-k">{h}</h3>
          <ul>
            {rows.map((r) => (
              <li key={r.href}>
                <Link href={r.href} className="dh-row">
                  <span className="dh-t">{r.title}{r.n !== undefined && <span className="dh-n">{r.n}</span>}</span>
                  <span className="dh-d">{r.text}</span>
                </Link>
                {r.sub && (
                  <ul className="dh-sub">
                    {r.sub.map((s) => <li key={s.href}><Link href={s.href}><span className={`method-badge${s.method === "POST" ? " is-post" : ""}`}>{s.method}</span>{s.title}</Link></li>)}
                    <li><Link href={r.href} className="dh-all">All {r.n} endpoints</Link></li>
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

export default function Docs() {
  return (
    <div className="page-head docs-home" style={{ paddingBottom: 96 }}>
      <h1><span>How to use CricSynthesis</span></h1>
      <p className="cs-lede">Guides for following a match, and the reference for building with our data.</p>
      <DocsSearch items={SEARCH} />
      <p className="dh-jump"><a href="#using">Using CricSynthesis ↓</a><a href="#developers">For developers ↓</a></p>
      <div className="dh-split">
        <List id="using" label="For fans" title="Using CricSynthesis" text="What every number on a match page means, and how to use it before and during a game."
              start={["/docs/guide/", "Start with the guide"]} groups={USING} />
        <List id="developers" label="For developers" title="Building with CricSynthesis" text="Put our forecasts, analytics and graphics in your own site, app, broadcast or AI assistant."
              start={["/docs/api/#overview", "Start with the quickstart"]} groups={BUILDING} />
      </div>
      <p className="dh-foot">Can&apos;t find it? <Link href="/contact/">Ask us</Link>. On your phone? Get the <Link href="/app/">Android app</Link>.</p>
    </div>
  );
}
