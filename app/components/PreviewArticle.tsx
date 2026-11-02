// A written match preview (server-rendered): the blog article layout, filled from lib/preview.ts.
import Link from "next/link";
import { Byline } from "@/components/Byline";
import { PREVIEW_AUTHOR, type Article, type Block } from "@/lib/preview";
import { SITE } from "@/lib/seo";

/** **bold** and [text](href) inside a paragraph. */
function Rich({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g);
  return <>{parts.map((s, i) => {
    if (s.startsWith("**")) return <b key={i}>{s.slice(2, -2)}</b>;
    const m = s.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    return m ? <Link key={i} href={m[2]}>{m[1]}</Link> : s;
  })}</>;
}

function BlockView({ b }: { b: Block }) {
  if ("p" in b) return <p><Rich text={b.p} /></p>;
  if ("list" in b) return b.ordered ? <ol>{b.list.map((x, i) => <li key={i}><Rich text={x} /></li>)}</ol>
    : <ul>{b.list.map((x, i) => <li key={i}><Rich text={x} /></li>)}</ul>;
  if ("table" in b) return (
    <div className="post-table"><table>
      {b.table.head.some(Boolean) && <thead><tr>{b.table.head.map((h, i) => <th key={i}>{h}</th>)}</tr></thead>}
      <tbody>{b.table.rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}><Rich text={c} /></td>)}</tr>)}</tbody>
    </table></div>);
  if ("stats" in b) return <div className="post-stats">{b.stats.map((s) => <div key={s.label}><b>{s.big}</b><span>{s.label}</span></div>)}</div>;
  return <p className="pv-links">{b.links.map((l) => <Link key={l.href + l.label} href={l.href}>{l.label} →</Link>)}</p>;
}

export default function PreviewArticle({ a, ld, home = ["Match previews", "/previews/"] }: { a: Article; ld: object[]; home?: [string, string] }) {
  const updated = new Date(a.updated);
  return (
    <article className="page-head blog post wide">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
      <div style={{ maxWidth: 820 }}>
        <p className="cs-eyebrow"><Link href={home[1]}>{home[0]}</Link>{a.series ? ` · ${a.series}` : ""}</p>
        <h1 className="post-title">{a.h1}</h1>
        <p className="post-standfirst">{a.standfirst}</p>
        <Byline name={PREVIEW_AUTHOR.name} role={PREVIEW_AUTHOR.role} date={a.date} minutes={a.minutes} url={`${SITE}${a.path}`} title={a.title} />
        {a.played && <p className="notice" style={{ marginTop: 16 }}>This match has been played. This was our pre-match
          {a.path.startsWith("/fantasy/") ? " fantasy prediction" : " preview"}, kept as it was.{" "}
          {a.result ? <Link href={`/results/${encodeURIComponent(a.id)}/`}>See what happened against our forecast →</Link>
            : <Link href={`/match/${encodeURIComponent(a.id)}/`}>Open the match centre →</Link>}</p>}
        <p className="small muted pv-status" style={{ marginTop: 8 }}>
          <span className={`tag ${a.xis ? "status-xis" : ""}`}>{a.xis ? "Playing XIs confirmed" : "Probable XIs"}</span>
          Updated {updated.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} IST
        </p>
      </div>
      <div className="post-layout">
        <div className="post-body">
          <div className="keypoints"><h2>Key points</h2><ul>{a.keypoints.map((k) => <li key={k}>{k}</li>)}</ul></div>
          {a.sections.map((s) => (
            <section key={s.id}>
              <h2 id={s.id}>{s.heading}</h2>
              {s.blocks.map((b, i) => <BlockView key={i} b={b} />)}
            </section>
          ))}
          <h2 id="faq">Questions people ask</h2>
          {a.faq.map((f) => <div key={f.q} className="post-faq"><h3>{f.q}</h3><p>{f.a}</p></div>)}
          <div className="post-author">
            <p><b>{PREVIEW_AUTHOR.name}</b> · {PREVIEW_AUTHOR.role}</p>
            <p>Written from our simulation of the match: every ball played out thousands of times with the actual XIs, ground and form. They are projections, not certainties.</p>
          </div>
        </div>
        <nav className="post-toc" aria-label="In this article">
          <p>In this article</p>
          {a.sections.map((s) => <a key={s.id} href={`#${s.id}`}>{s.heading}</a>)}
          <a href="#faq">Questions people ask</a>
        </nav>
      </div>
    </article>
  );
}
