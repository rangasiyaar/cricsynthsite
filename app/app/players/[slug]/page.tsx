// A player: projected runs, wickets and fantasy points in each match we have forecast, against what happened.
import Link from "next/link";
import { Faq, Hub, crumbs, faqLd, hubMeta, pc, r0 } from "@/components/Hubs";
import { KIND } from "@/lib/format";
import { paramsOf, upcoming, playerPath, players } from "@/lib/hubs";
import { matchPath, resultPath } from "@/lib/matchText";

type P = { params: Promise<{ slug: string }> };
export const dynamicParams = false;
export const generateStaticParams = () => paramsOf(players());

function data(s: string) {
  const p = players().get(s);
  if (!p) return null;
  const next = [...p.matches].reverse().find((m) => upcoming(m.row));
  const style = [p.hand && p.hand !== "unknown" ? `${p.hand}-hand bat` : "", p.bowling && p.bowling !== "unknown" ? KIND[p.bowling] : ""].filter(Boolean).join(", ");
  const qa = next ? [
    { q: `How many runs will ${p.name} score in ${next.row.title}?`, a: `About ${r0(next.runs)} on average across our simulations; top scorer for ${next.team} in ${pc(next.topScorer)} of them.` },
    ...(next.fantasy ? [{ q: `Is ${p.name} a good fantasy pick for ${next.row.title}?`, a: `${p.name} projects ${next.fantasy.toFixed(0)} fantasy points on average.` }] : []),
  ] : [];
  return { p, next, style, qa };
}

export async function generateMetadata({ params }: P) {
  const s = (await params).slug, d = data(s);
  return hubMeta(`/players/${s}/`, d ? `${d.p.name} Prediction: Projected Runs, Wickets & Fantasy Points` : "Player",
    d ? `${d.p.name} (${d.p.teams.join(", ")}): projected runs, wickets and fantasy points in every match we forecast, against what happened.` : "", !!d);
}

export default async function Page({ params }: P) {
  const d = data((await params).slug);
  if (!d) return <Hub crumb={["Players", "/players/"]} h1="Player">{null}</Hub>;
  const { p } = d;
  return (
    <Hub crumb={["Players", "/players/"]} h1={`${p.name} Prediction`}
      ld={[crumbs([["Players", "/players/"], [p.name, playerPath(p.name, p.id)!]]),
           { "@context": "https://schema.org", "@type": "Person", name: p.name, affiliation: p.teams.map((t) => ({ "@type": "SportsTeam", name: t })) },
           ...(d.qa.length ? [faqLd(d.qa)] : [])]}
      lede={<>{p.teams.join(", ")}{d.style ? ` · ${d.style}` : ""}.{d.next ? <> Next: <Link href={matchPath(d.next.row.id)}>{d.next.row.title}</Link>, about <b>{r0(d.next.runs)}</b> runs projected.</> : null}</>}>
      <h2>Match by match</h2>
      <div className="table-wrap"><table className="res-table">
        <thead><tr><th>Date</th><th>Match</th><th className="num">Runs (avg)</th><th className="num">Top scorer</th><th className="num">Wickets (avg)</th>
          <th className="num">Fantasy (avg)</th><th className="num">Fantasy (real)</th></tr></thead>
        <tbody>{p.matches.map((m) => (
          <tr key={m.row.id}><td className="small">{m.row.date}</td>
            <td><Link href={m.row.result ? resultPath(m.row.id) : matchPath(m.row.id)}>{m.row.title}</Link></td>
            <td className="num">{r0(m.runs)}</td><td className="num">{pc(m.topScorer)}</td>
            <td className="num">{m.wickets === null ? "—" : m.wickets.toFixed(1)}</td>
            <td className="num">{r0(m.fantasy)}</td><td className="num">{r0(m.real)}</td></tr>
        ))}</tbody>
      </table></div>
      <Faq qa={d.qa} />
    </Hub>
  );
}
