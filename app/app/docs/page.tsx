// Docs home: how to use CricSynthesis. A search, then two lists side by side (stacked on phones): using the site and
// app (each Guide topic), and building with the API (reference, playground, MCP, plans). Plain link rows, no cards.
import type { Metadata } from "next";
import Link from "next/link";
import DocsSearch, { type SearchItem } from "@/components/DocsSearch";
import { GUIDE, guidePath } from "@/lib/guide";
import { CATEGORIES, ENDPOINTS } from "@/lib/apiref";
import { seo } from "@/lib/seo";
import { PRO, rupees } from "@/lib/pro";
import { API_PLUS } from "@/lib/plans";

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
  ["Products", [
    { href: "/matches/", title: "Matches", text: "Today's games, upcoming fixtures and results. The Overview is free for every match." },
    { href: "/pro/", title: PRO.name, text: `Every section of every match page, plus the full MatchSynth Lab. ${rupees(PRO.monthly)} a month, first day free.` },
    { href: "/lab/", title: "MatchSynth Lab", text: "Change the toss, the pitch or a player's form, and replay the match." },
    { href: "/app/", title: "Android app", text: "Every match page on your phone." },
    { href: "/pricing/", title: "Pricing", text: "Free and Pro side by side, monthly or yearly." }]],
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
    { href: "/developers/", title: "CricSynthesis API", text: "What you can build with our data, with examples." },
    { href: "/developers/#plans", title: "API Free", text: "200 calls a day to get started." },
    { href: "/developers/#plans", title: "API Plus", text: `20,000 calls a day and clean graphics, with ${PRO.name} included. ${rupees(API_PLUS.monthly)} a month.` },
    { href: "/contact/", title: "Business", text: "Higher limits and priority support. Talk to us." }]],
];

const SEARCH: SearchItem[] = [
  ...GUIDE.map((p) => ({ href: guidePath(p.slug), title: p.title, where: `Guide · ${p.group}`, hay: `${p.title} ${p.short} ${p.group}`.toLowerCase() })),
  ...ENDPOINTS.map((e) => ({ href: `/docs/api/#${e.id}`, title: e.summary, where: `API · ${e.method} ${e.path}`, hay: `${e.summary} ${e.path} ${e.category}`.toLowerCase() })),
  ...BUILDING.flatMap(([, rows]) => rows.filter((r) => !r.n).map((r) => ({ href: r.href, title: r.title, where: "Developers", hay: `${r.title} ${r.text}`.toLowerCase() }))),
  { href: "/lab/", title: "MatchSynth Lab", where: "Tools", hay: "matchsynth lab what if scenario" },
];

function List({ id, label, title, text, start, more, groups }: { id: string; label: string; title: string; text: string; start: [string, string]; more: [string, string][]; groups: [string, Row[]][] }) {
  return (
    <section id={id} className="dh-col" aria-labelledby={`${id}-h`}>
      <p className="cs-k">{label}</p>
      <h2 id={`${id}-h`}>{title}</h2>
      <p className="dh-intro">{text}</p>
      <div className="dh-ctas">
        <Link className="cs-btn cs-btn--primary" href={start[0]}>{start[1]}</Link>
        {more.map(([h, t]) => <Link key={h} className="cs-btn cs-btn--secondary" href={h}>{t}</Link>)}
      </div>
      {groups.map(([h, rows]) => (
        <div key={h} className="dh-group">
          <h3 className="cs-k">{h}</h3>
          <ul>
            {rows.map((r) => (
              <li key={r.href + r.title}>
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
      <p className="cs-eyebrow">Documentation</p>
      <h1><span>How to use CricSynthesis</span></h1>
      <p className="cs-lede">Guides for following a match, and the reference for building with our data.</p>
      <DocsSearch items={SEARCH} />
      <p className="dh-jump"><a href="#using">Using CricSynthesis ↓</a><a href="#developers">For developers ↓</a></p>
      <div className="dh-split">
        <List id="using" label="For fans" title="Using CricSynthesis" text="What every number on a match page means, and how to use it before and during a game."
              start={["/docs/guide/", "Start with the guide"]} more={[["/matches/", "See matches"], ["/pro/", "Get Pro"]]} groups={USING} />
        <List id="developers" label="For developers" title="Building with CricSynthesis" text="Put our forecasts, analytics and graphics in your own site, app, broadcast or AI assistant."
              start={["/docs/api/#overview", "Start with the quickstart"]} more={[["/account/", "Get an API key"], ["/playground/", "Playground"]]} groups={BUILDING} />
      </div>
      <div className="dh-band">
        <div>
          <h2>Every section of every match</h2>
          <p>{PRO.name} opens scores over by over, every player, batter v bowler, the ground, our fantasy teams and the full MatchSynth Lab.
            {" "}{rupees(PRO.monthly)} a month or {rupees(PRO.yearly)} a year. Your first day is free.</p>
          <div className="dh-ctas"><Link className="cs-btn cs-btn--primary" href="/pro/">Get Pro</Link><Link className="cs-btn cs-btn--secondary" href="/pricing/">See pricing</Link></div>
        </div>
        <div>
          <h2>Build with our data</h2>
          <p>Start free with 200 calls a day. Move to API Plus for 20,000 calls a day and clean graphics, or talk to us about Business.</p>
          <div className="dh-ctas"><Link className="cs-btn cs-btn--primary" href="/account/">Get a free key</Link><Link className="cs-btn cs-btn--secondary" href="/developers/#plans">See API plans</Link></div>
        </div>
      </div>
      <p className="dh-foot">Can&apos;t find it? <Link href="/contact/">Ask us</Link>. On your phone? Get the <Link href="/app/">Android app</Link>.
        {" "}Want to know who we are? <Link href="/about/">About us</Link>.</p>
    </div>
  );
}
