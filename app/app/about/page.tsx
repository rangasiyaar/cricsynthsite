// About: who we are, why we started, what we do and what we stand for. The figures come from the published results
// (rebuilt nightly), never typed in. Copy rules: app/DESIGN.md (no method details; plain, human sentences).
import type { Metadata } from "next";
import Link from "next/link";
import { readResults } from "@/lib/build";
import { guidePath } from "@/lib/guide";
import { ldJson } from "@/lib/ld";
import { SITE, seo } from "@/lib/seo";

export const metadata: Metadata = seo("/about/", "About CricSynthesis",
  "CricSynthesis is an independent cricket analytics company in Bengaluru, led by Saurav Kumar. We forecast every match we cover and explain what the numbers mean.");

const EMAIL = "saurav@cricsynthesis.in";
const X = "https://x.com/saysaurav";
const INSTAGRAM = "https://instagram.com/saysaurav";

const WHAT = [
  { title: "For fans", text: "A page for every match we cover: who's favourite, what each side should score, when wickets fall and who to watch. Pro opens every tab and MatchSynth Lab.",
    links: [["/matches/", "Matches"], ["/app/", "Android app"]] },
  { title: "For fantasy players", text: "Ready-made teams for small and big contests, and a rating for every player in the match.",
    links: [["/fantasy/", "Fantasy predictions"], [guidePath("pick-your-fantasy-team-in-5-minutes"), "Pick a team in 5 minutes"]] },
  { title: "For developers and businesses", text: "One API for player and venue analytics, match forecasts and broadcast-ready graphics, with access from AI assistants too.",
    links: [["/developers/", "API"], ["/docs/", "Docs"]] },
];

const VALUES = [
  ["Independent", "We aren't tied to any board, league, team or broadcaster."],
  ["On the record", "Every pre-match call is checked against the scorecard and published, misses included."],
  ["Analysis, not betting", "No odds and no tips. Accounts are for adults only."],
  ["Your data is yours", "MatchSynth Lab runs on your device, and we don't sell personal data."],
];

function figures() {
  const r = readResults();
  if (!r || !r.matches.length) return null;
  const comps = new Set(r.matches.map((m) => (m.competition ?? "").split(" · ")[0].split(",")[0].trim()).filter(Boolean));
  return [
    [r.matches.length.toLocaleString("en-IN"), "matches checked"],
    [r.checks.toLocaleString("en-IN"), "pre-match calls marked"],
    [r.accuracy != null ? `${Math.round(100 * r.accuracy)}%` : "—", "came true"],
    [comps.size.toLocaleString("en-IN"), "competitions"],
  ];
}

export default function About() {
  const nums = figures();
  const ld = { "@context": "https://schema.org", "@type": "AboutPage", url: `${SITE}/about/`, name: "About CricSynthesis",
    mainEntity: { "@type": "Organization", name: "CricSynthesis", url: SITE, logo: `${SITE}/brand-logo.png`, email: EMAIL,
      address: { "@type": "PostalAddress", addressLocality: "Bengaluru", addressCountry: "IN" },
      sameAs: ["https://in.linkedin.com/company/cricsynthesis", "https://x.com/cricsynthesis", "https://instagram.com/cricsynthesis"],
      employee: { "@type": "Person", name: "Saurav Kumar", email: EMAIL, sameAs: [X, INSTAGRAM] } } };
  return (
    <div className="page-head about" style={{ paddingBottom: 80 }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson(ld) }} />
      <h1><span>About CricSynthesis</span></h1>
      <p className="cs-lede">We forecast cricket matches before a ball is bowled, and explain what the numbers mean.
        We&apos;re a small, independent team in Bengaluru, led by Saurav Kumar.</p>

      <section className="about-section">
        <h2>Why we started</h2>
        <div className="about-prose">
          <p>Fans get scores and commentary. What they rarely get is a clear sense of what&apos;s likely to happen next, and why.
            We wanted every fan to read a match the way a good analyst does, in words that make sense.</p>
          <p>Knowing the game better makes watching it better. So every number we show comes with a short explanation, and our
            guide covers the rest.</p>
          <p>The same gap exists on the other side of the game. Developers, media companies and teams who need cricket
            analytics usually have two choices: raw data they must model themselves, or expensive tools built for someone else.
            We built one API that answers their questions directly.</p>
        </div>
      </section>

      <section className="about-section">
        <h2>What we do</h2>
        <div className="grid g3">
          {WHAT.map((w) => (
            <div key={w.title} className="card about-card">
              <h3>{w.title}</h3>
              <p className="muted">{w.text}</p>
              <p className="about-links">{w.links.map(([href, label]) => <Link key={href} href={href}>{label}</Link>)}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="about-section">
        <h2>How it works</h2>
        <div className="about-prose">
          <p>We play every match out many times on computer, ball by ball, using each player&apos;s record and how the ground
            tends to play. The forecast is run again when the playing XIs are named and after the toss.{" "}
            <Link href={guidePath("how-our-forecasts-are-made")}>How our forecasts are made</Link></p>
        </div>
      </section>

      <section className="about-section">
        <h2>What we stand for</h2>
        <div className="grid g2 about-values">
          {VALUES.map(([t, d]) => <div key={t}><h3>{t}</h3><p className="muted">{d}</p></div>)}
        </div>
      </section>

      {nums && (
        <section className="about-section">
          <h2>Our record so far</h2>
          <div className="grid about-nums">
            {nums.map(([v, l]) => <div key={l} className="card"><b>{v}</b><span className="muted">{l}</span></div>)}
          </div>
          <p className="small muted" style={{ marginTop: 12 }}>From the <Link href="/matches/?f=finished">results</Link> of every match we&apos;ve
            covered, updated every night.</p>
        </section>
      )}

      <section className="about-section">
        <h2>Who we are</h2>
        <div className="card about-person">
          <span className="about-initials" aria-hidden="true">SK</span>
          <div>
            <h3>Saurav Kumar</h3>
            <p className="muted">Leads CricSynthesis, in Bengaluru.</p>
            <p className="about-links">
              <a href={`mailto:${EMAIL}`}>{EMAIL}</a>
              <a href={X} target="_blank" rel="noopener noreferrer">X @saysaurav</a>
              <a href={INSTAGRAM} target="_blank" rel="noopener noreferrer">Instagram @saysaurav</a>
            </p>
          </div>
        </div>
      </section>

      <section className="about-section">
        <h2>Get in touch</h2>
        <div className="about-prose">
          <p>Questions about forecasts or Pro, or a partnership in mind? <Link href="/contact/">Send us a message</Link>.
            For API access, see <Link href="/developers/">plans</Link>. We&apos;re also <Link href="/careers/">hiring</Link>.</p>
        </div>
      </section>
    </div>
  );
}
