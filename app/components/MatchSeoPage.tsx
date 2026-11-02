// One per-match search page (server-rendered at build): a heading and the key numbers in the HTML, the live match centre,
// then the preview text, line-ups and FAQ written from the forecast. Used by /match/{id}/, /fantasy/ and /playing-xi/.
import type { Metadata } from "next";
import Link from "next/link";
import LiveMatch from "@/components/LiveMatch";
import { readMatch } from "@/lib/build";
import { description, facts, faq, jsonLd, matchPath, title, type Kind } from "@/lib/matchText";
import { seo } from "@/lib/seo";

const TAB: Record<Kind, string | undefined> = { prediction: undefined, fantasy: "fantasy", xi: "players" };
const NAV: [Kind, string][] = [["prediction", "Prediction"], ["fantasy", "Fantasy"], ["xi", "Playing XI"]];

export function matchMetadata(id: string, kind: Kind): Metadata {
  const doc = readMatch(id);
  if (!doc) return seo(matchPath(id, kind), "Match | CricSynthesis", "Cricket match forecast.", { noindex: true });
  const x = facts(doc);
  // A fantasy page without picks says nothing yet: keep it out of search until it does.
  return seo(matchPath(id, kind), `${title(x, kind)} | CricSynthesis`, description(x, kind), { noindex: kind === "fantasy" && !x.fantasy });
}

export default function MatchSeoPage({ id, kind }: { id: string; kind: Kind }) {
  const doc = readMatch(id);
  if (!doc) return <LiveMatch id={id} tab={TAB[kind]} />;      // no text to write (placeholder or an odd document): the match centre alone
  const x = facts(doc);
  const qa = faq(x, kind);
  const [a, b] = x.score;
  const h1 = kind === "fantasy" ? `${x.A} vs ${x.B} Fantasy Prediction` : kind === "xi"
    ? `${x.A} vs ${x.B} ${x.xis ? "Playing XI" : "Probable Playing XI"}` : `${x.A} vs ${x.B} Prediction`;
  const sub = [x.series, x.no, x.when, x.time && `${x.time} IST`, x.venue].filter(Boolean).join(" · ");
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd(x, kind, id, qa)) }} />
      <div className="page-head seo-head">
        <nav className="small muted" aria-label="Breadcrumb"><Link href="/matches/">Matches</Link> / {x.A} vs {x.B}</nav>
        <h1 className="seo-h1">{h1}</h1>
        <p className="small muted" style={{ margin: "6px 0 0" }}>{sub}</p>
        <p className="seo-key">
          <b>{x.fav}</b> win <b>{Math.round(100 * x.pFav)}%</b> of {x.sims.toLocaleString("en-IN")} simulations · projected{" "}
          {a.team} <b>{Math.round(a.mean ?? 0)}</b>, {b.team} <b>{Math.round(b.mean ?? 0)}</b>
        </p>
        <nav className="seo-nav" aria-label="Match pages">
          {NAV.map(([k, l]) => (
            <Link key={k} href={matchPath(id, k)} aria-current={k === kind ? "page" : undefined}>{l}</Link>
          ))}
          <Link href={`/lab/?id=${encodeURIComponent(id)}`}>MatchSynth Lab</Link>
        </nav>
      </div>

      <LiveMatch id={id} tab={TAB[kind]} />

      <article className="page-head seo-body">
        {kind === "prediction" && <>
          <h2>Match preview</h2>
          {x.insights.slice(0, 8).map((t, i) => <p key={i}>{t.text}</p>)}
        </>}
        {kind === "fantasy" && (x.fantasy ? <>
          <h2>Top fantasy picks</h2>
          <ol>{x.picks.map((p) => <li key={p.id}><b>{p.name}</b> ({p.team}) · {p.expected.toFixed(0)} expected points</li>)}</ol>
          <p>Captain <b>{x.name(x.fantasy.single.captain)}</b>, vice-captain <b>{x.name(x.fantasy.single.vice_captain)}</b>.
            {x.xis ? " Built on the confirmed playing XIs." : " Built on the probable XIs; it updates when the line-ups are named."}</p>
        </> : <p>Fantasy picks appear here once the squads are in.</p>)}
        {(kind === "xi" || kind === "fantasy") && <>
          <h2>{x.xis ? "Playing XIs" : "Probable XIs"}</h2>
          <div className="grid g2">
            {x.xi.map((t) => <div key={t.team}><h3>{t.team}</h3><ol>{t.players.map((p) => <li key={p}>{p}</li>)}</ol></div>)}
          </div>
          {!x.xis && <p className="small muted">Probable XIs from recent line-ups; the forecast reruns once the toss is done and the teams are named.</p>}
        </>}
        <h2>Questions people ask</h2>
        {qa.map((f) => <details key={f.q} className="seo-faq"><summary>{f.q}</summary><p>{f.a}</p></details>)}
        <p className="small muted">Forecasts come from simulating the match ball by ball; they are projections, not certainties.{" "}
          <Link href="/results/">See how past forecasts did</Link>.</p>
      </article>
    </>
  );
}
