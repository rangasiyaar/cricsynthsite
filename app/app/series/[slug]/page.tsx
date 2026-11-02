// A series or league: every match we have forecast in it, and how the forecasts did.
import { Faq, Hub, MatchTable, crumbs, faqLd, hubMeta, pc, record, verdict } from "@/components/Hubs";
import { paramsOf, upcoming, series, seriesPath } from "@/lib/hubs";

type P = { params: Promise<{ slug: string }> };
export const dynamicParams = false;
export const generateStaticParams = () => paramsOf(series());

function data(s: string) {
  const list = series().get(s);
  if (!list) return null;
  const name = list[0].series;
  const next = [...list].reverse().find(upcoming);
  const rec = record(list);
  const qa = [
    ...(next ? [{ q: `Who will win the next ${name} match?`, a: `${next.title}${next.date ? ` (${next.date})` : ""}: ${verdict(next).fav} win ${pc(verdict(next).p)} of our simulations.` }] : []),
    ...(rec.n ? [{ q: `How accurate are the ${name} predictions?`, a: `The favourite won ${rec.fav} of ${rec.n} finished matches; ${rec.hits} of ${rec.checks} projections came true.` }] : []),
  ];
  return { list, name, next, rec, qa };
}

export async function generateMetadata({ params }: P) {
  const s = (await params).slug, d = data(s);
  return hubMeta(`/series/${s}/`, d ? `${d.name} Predictions: Every Match Forecast & Result` : "Series",
    d ? `${d.name}: win probability and projected scores for every match, and how each forecast did.` : "", !!d);
}

export default async function Page({ params }: P) {
  const d = data((await params).slug);
  if (!d) return <Hub crumb={["Series", "/series/"]} h1="Series">{null}</Hub>;
  return (
    <Hub crumb={["Series", "/series/"]} h1={`${d.name} Predictions`} ld={[crumbs([["Series", "/series/"], [d.name, seriesPath(d.name)]]), faqLd(d.qa)]}
      lede={<>{d.list.length} match{d.list.length === 1 ? "" : "es"} forecast{d.rec.n ? <>; the favourite won <b>{d.rec.fav} of {d.rec.n}</b>, and {d.rec.hits} of {d.rec.checks} projections came true</> : null}.</>}>
      <h2>Matches</h2>
      <MatchTable list={d.list} show="venue" />
      <Faq qa={d.qa} />
    </Hub>
  );
}
