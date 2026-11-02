// Head to head: every meeting of two sides we have forecast.
import { Faq, Hub, MatchTable, crumbs, faqLd, hubMeta, pc, record, verdict } from "@/components/Hubs";
import { pairPath, pairs, paramsOf, upcoming } from "@/lib/hubs";

type P = { params: Promise<{ slug: string }> };
export const dynamicParams = false;
export const generateStaticParams = () => paramsOf(pairs());

function data(s: string) {
  const list = pairs().get(s);
  if (!list) return null;
  const [a, b] = list[0].teams;
  const next = [...list].reverse().find(upcoming);
  const done = list.filter((r) => r.result?.winner);
  const wins = (t: string) => done.filter((r) => r.result!.winner === t).length;
  const qa = [
    ...(next ? [{ q: `Who will win ${a} vs ${b}?`, a: `In the next meeting${next.date ? ` (${next.date})` : ""}, ${verdict(next).fav} win ${pc(verdict(next).p)} of our simulations.` }] : []),
    ...(done.length ? [{ q: `${a} vs ${b} head to head in the matches we forecast?`, a: `${a} ${wins(a)}, ${b} ${wins(b)} of ${done.length}.` }] : []),
  ];
  return { list, a, b, next, done, wins, qa, rec: record(list) };
}

export async function generateMetadata({ params }: P) {
  const s = (await params).slug, d = data(s);
  return hubMeta(`/teams/${s}/`, d ? `${d.a} vs ${d.b} Prediction & Head to Head: Every Forecast` : "Head to head",
    d ? `${d.a} vs ${d.b}: who will win the next match, projected scores, and how every forecast between them turned out.` : "", !!d);
}

export default async function Page({ params }: P) {
  const d = data((await params).slug);
  if (!d) return <Hub crumb={["Head to head", "/teams/"]} h1="Head to head">{null}</Hub>;
  const title = `${d.a} vs ${d.b}`;
  return (
    <Hub crumb={["Head to head", "/teams/"]} h1={`${title}: Predictions & Head to Head`}
      ld={[crumbs([["Head to head", "/teams/"], [title, pairPath(d.a, d.b)]]), faqLd(d.qa)]}
      lede={<>{d.next ? <>Next: <b>{verdict(d.next).fav}</b> win {pc(verdict(d.next).p)}. </> : null}
        {d.done.length ? <>{d.a} {d.wins(d.a)} – {d.wins(d.b)} {d.b} in the matches we forecast.</> : null}</>}>
      <h2>Meetings</h2>
      <MatchTable list={d.list} />
      <Faq qa={d.qa} />
    </Hub>
  );
}
