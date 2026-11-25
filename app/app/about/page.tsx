// About: who we are, why we started, what we do and what we stand for, in the legal-page layout (like /privacy/). The figures come from the published results
// (rebuilt nightly), never typed in. Copy rules: app/DESIGN.md (no method details; plain, human sentences).
import type { Metadata } from "next";
import Link from "next/link";
import { readResults } from "@/lib/build";
import { guidePath } from "@/lib/guide";
import Legal from "@/components/Legal";
import { ldJson } from "@/lib/ld";
import { SITE, seo } from "@/lib/seo";

export const metadata: Metadata = seo("/about/", "About CricSynthesis",
  "CricSynthesis is an independent cricket analytics company in Bengaluru, led by Saurav Kumar. We forecast every match we cover and explain what the numbers mean.");

const EMAIL = "saurav@cricsynthesis.in";
const X = "https://x.com/saysaurav";
const INSTAGRAM = "https://instagram.com/saysaurav";

function figures() {
  const r = readResults();
  if (!r || !r.matches.length) return null;
  const comps = new Set(r.matches.map((m) => (m.competition ?? "").split(" · ")[0].split(",")[0].trim()).filter(Boolean));
  return {
    matches: r.matches.length.toLocaleString("en-IN"), checks: r.checks.toLocaleString("en-IN"),
    accuracy: r.accuracy != null ? `${Math.round(100 * r.accuracy)}%` : null, comps: comps.size.toLocaleString("en-IN"),
  };
}

export default function About() {
  const nums = figures();
  const ld = { "@context": "https://schema.org", "@type": "AboutPage", url: `${SITE}/about/`, name: "About CricSynthesis",
    mainEntity: { "@type": "Organization", name: "CricSynthesis", url: SITE, logo: `${SITE}/brand-logo.png`, email: EMAIL,
      address: { "@type": "PostalAddress", addressLocality: "Bengaluru", addressCountry: "IN" },
      sameAs: ["https://in.linkedin.com/company/cricsynthesis", "https://x.com/cricsynthesis", "https://instagram.com/cricsynthesis"],
      employee: { "@type": "Person", name: "Saurav Kumar", email: EMAIL, sameAs: [X, INSTAGRAM] } } };
  return (<>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson(ld) }} />
    <Legal title="About Us" subtitle="CricSynthesis, Bengaluru">
      <h2>1. Who we are</h2>
      <p>CricSynthesis forecasts cricket matches before a ball is bowled, and explains what the numbers mean. We&apos;re a small,
        independent team in Bengaluru, led by Saurav Kumar.</p>

      <h2>2. Why we started</h2>
      <p>Fans get scores and commentary. What they rarely get is a clear sense of what&apos;s likely to happen next, and why.
        We wanted every fan to read a match the way a good analyst does, in words that make sense.</p>
      <p>Knowing the game better makes watching it better. So every number we show comes with a short explanation, and
        our <Link href="/docs/guide/">guide</Link> covers the rest.</p>
      <p>The same gap exists on the other side of the game. Developers, media companies and teams who need cricket analytics
        usually have two choices: raw data they must model themselves, or expensive tools built for someone else. We built
        one API that answers their questions directly.</p>

      <h2>3. What we do</h2>
      <ul>
        <li><b>For fans.</b> A page for every match we cover: who&apos;s favourite, what each side should score, when wickets fall
          and who to watch. The Overview is free; <Link href="/pro/">CricSynthesis Pro</Link> opens every section and MatchSynth
          Lab. See <Link href="/matches/">matches</Link> or get the <Link href="/app/">Android app</Link>.</li>
        <li><b>For fantasy players.</b> Ready-made teams for small and big contests, and a rating for every player in the
          match. See <Link href="/fantasy/">fantasy predictions</Link>.</li>
        <li><b>For developers and businesses.</b> One API for player and ground analytics, match forecasts and ready-to-share
          graphics, also usable from AI assistants. See the <Link href="/developers/">API</Link> and the <Link href="/docs/">docs</Link>.</li>
      </ul>

      <h2>4. How it works</h2>
      <p>We play every match out many times on computer, ball by ball, using each player&apos;s record and how the ground tends
        to play. The forecast is run again when the playing XIs are named and after the toss. More in{" "}
        <Link href={guidePath("how-our-forecasts-are-made")}>how our forecasts are made</Link>.</p>

      <h2>5. What we stand for</h2>
      <ul>
        <li><b>Independent.</b> We aren&apos;t tied to any board, league, team or broadcaster.</li>
        <li><b>On the record.</b> Every pre-match call is checked against the scorecard and published, misses included.</li>
        <li><b>Analysis, not betting.</b> No odds and no tips. Accounts are for adults only.</li>
        <li><b>Your data is yours.</b> MatchSynth Lab runs on your device, and we don&apos;t sell personal data.
          See our <Link href="/privacy/">privacy policy</Link>.</li>
      </ul>

      {nums && <>
        <h2>6. Our record so far</h2>
        <p>We&apos;ve checked {nums.matches} matches across {nums.comps} competitions and marked {nums.checks} pre-match
          calls{nums.accuracy && <>, of which {nums.accuracy} came true</>}. Every one is on the{" "}
          <Link href="/matches/?f=finished">results</Link> pages, updated every night.</p>
      </>}

      <h2>{nums ? 7 : 6}. Who&apos;s behind it</h2>
      <p><b>Saurav Kumar</b> leads CricSynthesis from Bengaluru.</p>
      <ul>
        <li>Email: <a href={`mailto:${EMAIL}`}>{EMAIL}</a></li>
        <li>X: <a href={X} target="_blank" rel="noopener noreferrer">@saysaurav</a></li>
        <li>Instagram: <a href={INSTAGRAM} target="_blank" rel="noopener noreferrer">@saysaurav</a></li>
      </ul>

      <h2>{nums ? 8 : 7}. Get in touch</h2>
      <p>Questions about forecasts or Pro, or a partnership in mind? <Link href="/contact/">Send us a message</Link>. For API
        access, see the <Link href="/developers/#plans">plans</Link>. We&apos;re also <Link href="/careers/">hiring</Link>.</p>
    </Legal>
  </>);
}
