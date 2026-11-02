// A ground: the model's pitch read, and every match we have forecast there with how it went.
import { Faq, Hub, MatchTable, crumbs, faqLd, hubMeta, pc, r0, record } from "@/components/Hubs";
import { ground, paramsOf, venuePath, venues } from "@/lib/hubs";

type P = { params: Promise<{ slug: string }> };
export const dynamicParams = false;
export const generateStaticParams = () => paramsOf(venues());

const PHASE: Record<string, string> = { powerplay: "Powerplay", middle: "Middle overs", death: "Death overs" };

function data(s: string) {
  const list = venues().get(s);
  if (!list) return null;
  const name = list[0].venue!;
  const latest = list.find((r) => r.venueId) ?? list[0];
  const g = ground(latest.venueId, latest.format, (latest.doc.summary.meta.gender || "male"));
  const firsts = list.flatMap((r) => r.result?.scores?.[0] ? [{ r, runs: r.result.scores[0].runs }] : []);
  const proj = list.map((r) => r.doc.summary.teams.map((t) => t.batting.by_innings?.find((b) => b.innings === 1)?.score.mean ?? t.batting.score.mean))
    .flat().filter((x): x is number => typeof x === "number");
  const par = proj.length ? proj.reduce((a, b) => a + b, 0) / proj.length : null;
  const qa = [
    ...(g ? [{ q: `What is the pitch like at ${name}?`, a: `Our model reads ${name} as ${g.character}: scoring ${Math.round(100 * (g.scoring_index - 1))}% `
      + `and wickets ${Math.round(100 * (g.wicket_index - 1))}% against a neutral ground.` }] : []),
    ...(par ? [{ q: `What is a good first-innings score at ${name}?`, a: `Across our forecasts here, a typical first-innings projection is about ${Math.round(par)}.` }] : []),
    ...(firsts.length ? [{ q: `What have teams scored batting first at ${name}?`, a: firsts.slice(0, 6).map((f) => `${f.r.result!.scores[0].team} ${f.runs} (${f.r.date})`).join(", ") + "." }] : []),
  ];
  return { list, name, g, par, firsts, qa };
}

export async function generateMetadata({ params }: P) {
  const s = (await params).slug, d = data(s);
  return hubMeta(`/venues/${s}/`, d ? `${d.name} Pitch Report: Average Score & Match Predictions` : "Ground",
    d ? `${d.name} pitch report: how the ground plays${d.par ? `, typical first-innings projection ${Math.round(d.par)}` : ""}, and every match forecast here with results.` : "", !!d);
}

export default async function Page({ params }: P) {
  const d = data((await params).slug);
  if (!d) return <Hub crumb={["Grounds", "/venues/"]} h1="Ground">{null}</Hub>;
  const rec = record(d.list);
  return (
    <Hub crumb={["Grounds", "/venues/"]} h1={`${d.name} Pitch Report`} ld={[crumbs([["Grounds", "/venues/"], [d.name, venuePath(d.name)]]), faqLd(d.qa)]}
      lede={<>{d.g ? <>Plays <b>{d.g.character}</b>. </> : null}{d.par ? <>Typical first-innings projection <b>{Math.round(d.par)}</b>. </> : null}
        {d.list.length} match{d.list.length === 1 ? "" : "es"} forecast here{rec.n ? `; the favourite won ${rec.fav} of ${rec.n}` : ""}.</>}>
      {d.g && <>
        <h2>How the ground plays</h2>
        <div className="table-wrap"><table className="res-table">
          <thead><tr><th>Phase</th><th className="num">Runs per over</th><th className="num">Balls per wicket</th><th className="num">Boundary %</th></tr></thead>
          <tbody>{Object.entries(d.g.by_phase).map(([ph, v]) => <tr key={ph}><td>{PHASE[ph] ?? ph}</td><td className="num">{v.runs_per_over}</td>
            <td className="num">{r0(v.balls_per_wicket)}</td><td className="num">{pc(v.boundary_pct)}</td></tr>)}</tbody>
        </table></div>
        <p className="small muted">An average batter against an average attack at this ground, from the model.</p>
      </>}
      <h2>Matches at {d.name}</h2>
      <MatchTable list={d.list} />
      <Faq qa={d.qa} />
    </Hub>
  );
}
