// Server pieces of the evergreen hub pages (venues, series, head-to-head, players).
import type { Metadata } from "next";
import Link from "next/link";
import { longDate, matchPath, resultPath } from "@/lib/matchText";
import { pairPath, seriesPath, slug, venuePath, type Row } from "@/lib/hubs";
import { SITE, seo } from "@/lib/seo";

export const pc = (p?: number | null) => (p === null || p === undefined ? "—" : `${Math.round(100 * p)}%`);
export const r0 = (x?: number | null) => (x === null || x === undefined ? "—" : String(Math.round(x)));
export const hubMeta = (path: string, title: string, desc: string, ok: boolean): Metadata =>
  seo(path, `${title} | CricSynthesis`, desc, { noindex: !ok });

/** Favourite and how the match went, in words. */
export function verdict(r: Row) {
  const fav = r.win[0] >= r.win[1] ? 0 : 1;
  return { fav: r.teams[fav], p: r.win[fav], won: r.result ? r.result.favourite_won : undefined };
}

/** Our record over a set of matches: favourite won, projections that came true. */
export function record(list: Row[]) {
  const scored = list.filter((r) => r.result && r.result.checks);
  const fav = scored.filter((r) => r.result!.favourite_won).length;
  const hits = scored.reduce((a, r) => a + r.result!.hits, 0), checks = scored.reduce((a, r) => a + r.result!.checks, 0);
  return { n: scored.length, fav, hits, checks };
}

export function MatchTable({ list, show = "series" }: { list: Row[]; show?: "series" | "venue" | "none" }) {
  return (
    <div className="table-wrap"><table className="res-table">
      <thead><tr><th>Date</th><th>Match</th>{show !== "none" && <th>{show === "series" ? "Series" : "Ground"}</th>}
        <th>Our forecast</th><th className="num">Projected</th><th>Result</th></tr></thead>
      <tbody>{list.map((r) => {
        const v = verdict(r);
        return (
          <tr key={r.id}>
            <td className="small">{r.date ?? ""}</td>
            <td><Link href={matchPath(r.id)}>{r.title}</Link></td>
            {show === "series" && <td className="small">{r.series ? <Link href={seriesPath(r.series)}>{r.series}</Link> : "—"}</td>}
            {show === "venue" && <td className="small">{r.venue ? <Link href={venuePath(r.venue)}>{r.venue}</Link> : "—"}</td>}
            <td>{v.fav} {pc(v.p)}</td>
            <td className="num mono">{r.projected.map(r0).join(" – ")}</td>
            <td className="small">{r.result ? <Link href={resultPath(r.id)}>{r.result.result ?? "Result"}</Link>
              : <span className="muted">Upcoming</span>}</td>
          </tr>);
      })}</tbody>
    </table></div>
  );
}

export function Hub({ crumb, h1, lede, ld, children }: { crumb: [string, string]; h1: string; lede?: React.ReactNode;
                                                         ld?: object[]; children: React.ReactNode }) {
  return (
    <article className="page-head seo-body hub">
      {ld && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />}
      <nav className="small muted" aria-label="Breadcrumb"><Link href={crumb[1]}>{crumb[0]}</Link></nav>
      <h1 className="seo-h1">{h1}</h1>
      {lede && <p className="cs-lede">{lede}</p>}
      {children}
    </article>
  );
}

export const crumbs = (items: [string, string][]) => ({
  "@context": "https://schema.org", "@type": "BreadcrumbList",
  itemListElement: items.map(([name, p], i) => ({ "@type": "ListItem", position: i + 1, name, item: `${SITE}${p}` })),
});

export const faqLd = (qa: { q: string; a: string }[]) => ({
  "@context": "https://schema.org", "@type": "FAQPage",
  mainEntity: qa.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
});

export function Faq({ qa }: { qa: { q: string; a: string }[] }) {
  return <>{qa.length > 0 && <h2>Questions people ask</h2>}
    {qa.map((f) => <details key={f.q} className="seo-faq"><summary>{f.q}</summary><p>{f.a}</p></details>)}</>;
}

/** A list of links for the hub index pages. */
export function LinkList({ items }: { items: { href: string; label: string; sub?: string }[] }) {
  return <ul className="hub-list">{items.map((i) => <li key={i.href}><Link href={i.href}>{i.label}</Link>
    {i.sub && <span className="small muted"> · {i.sub}</span>}</li>)}</ul>;
}

export { longDate, pairPath, seriesPath, slug, venuePath };
