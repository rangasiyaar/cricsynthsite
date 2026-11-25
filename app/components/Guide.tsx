// The Guide's pages (content in lib/guide.ts): the sidebar, the guide home cards and one article. Used by the website
// (/docs/guide/, server-rendered) and the app (/m/guide/, client). `app` switches the links to the app's screens.
import Link from "next/link";
import GuideExample from "@/components/GuideExample";
import { GROUPS, GUIDE, appGuidePath, guidePath, type GuidePage } from "@/lib/guide";

const linkFor = (app: boolean) => (slug?: string) => (app ? appGuidePath(slug) : guidePath(slug));

export function AccessTag({ access }: { access?: "free" | "pro" }) {
  if (!access) return null;
  return access === "pro" ? <span className="tag pro">Pro</span> : <span className="tag">Free</span>;
}

/** The website's left-hand list of every page, by group. */
export function GuideNav({ current }: { current?: string }) {
  return (
    <nav className="guide-nav" aria-label="Guide">
      <Link href="/docs/" className="guide-nav-docs">Docs</Link>
      <Link href={guidePath()} className={`guide-nav-home${current ? "" : " on"}`}>Guide home</Link>
      {GROUPS.map((g) => (
        <div key={g} className="guide-nav-group">
          <p className="cs-k">{g}</p>
          {GUIDE.filter((p) => p.group === g).map((p) => (
            <Link key={p.slug} href={guidePath(p.slug)} className={p.slug === current ? "on" : undefined}
                  aria-current={p.slug === current ? "page" : undefined}>{p.title}</Link>
          ))}
        </div>
      ))}
      <Link href="/docs/api/" className="guide-nav-api">API reference</Link>
    </nav>
  );
}

/** The guide home: one card per page, by group. */
export function GuideCards({ app = false }: { app?: boolean }) {
  const href = linkFor(app);
  return (
    <div className="guide-groups">
      {GROUPS.map((g) => (
        <section key={g} className="guide-group">
          <h2>{g}</h2>
          <div className="guide-cards">
            {GUIDE.filter((p) => p.group === g).map((p) => (
              <Link key={p.slug} href={href(p.slug)} className="card guide-card">
                <span className="guide-card-head"><b>{p.title}</b><AccessTag access={p.access} /></span>
                <span className="small muted">{p.short}</span>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function List({ items, ordered = false }: { items: string[]; ordered?: boolean }) {
  const T = ordered ? "ol" : "ul";
  return <T className="guide-list">{items.map((t) => <li key={t}>{t}</li>)}</T>;
}

function Faq({ items }: { items: [string, string][] }) {
  return (
    <section>
      <h2>Questions</h2>
      <div className="guide-faq">
        {items.map(([q, a]) => <details key={q}><summary>{q}</summary><p>{a}</p></details>)}
      </div>
    </section>
  );
}

/** One page. */
export function GuideArticle({ page, app = false }: { page: GuidePage; app?: boolean }) {
  const href = linkFor(app);
  const i = GUIDE.findIndex((p) => p.slug === page.slug);
  const prev = GUIDE[i - 1], next = GUIDE[i + 1];
  const example = page.kind === "analysis" ? (page.section ?? page.sections?.[0]) : undefined;
  return (
    <article className="guide-article">
      {!app && <p className="small muted guide-crumbs"><Link href="/docs/">Docs</Link> / <Link href={guidePath()}>Guide</Link> / {page.group}</p>}
      <div className="guide-title"><h1>{page.title}</h1><AccessTag access={page.access} /></div>
      <p className="guide-lede">{page.kind === "analysis" ? page.what : page.intro}
        {page.kind === "howto" && <span className="muted"> About {page.minutes} minutes.</span>}</p>
      {page.access === "pro" && (
        <p className="guide-pro small">Part of CricSynthesis Pro. <Link href={app ? "/m/pro/" : "/pro/"}>Get Pro</Link></p>
      )}

      {page.kind === "analysis" && <>
        <section>
          <h2>On the page</h2>
          <List items={page.see} ordered />
          {example && <GuideExample section={example} app={app} />}
        </section>
        <section><h2>Reading it</h2>{page.read.map((t) => <p key={t}>{t}</p>)}
          {page.example && <p className="guide-eg"><b>Example.</b> {page.example}</p>}</section>
        <section><h2>Using it</h2><List items={page.decide} /></section>
        <section><h2>Watch out for</h2><List items={page.mistakes} /></section>
        <Faq items={page.faq} />
      </>}

      {page.kind === "howto" && <>
        <ol className="guide-steps">
          {page.steps.map((s, n) => (
            <li key={s.title}>
              <span className="guide-step-n" aria-hidden="true">{n + 1}</span>
              <div><h3>{s.title}</h3><p>{s.text}</p>
                {s.page && <Link className="small" href={href(s.page)}>More on {GUIDE.find((p) => p.slug === s.page)?.title.toLowerCase()}</Link>}</div>
            </li>
          ))}
        </ol>
        {page.tip && <p className="guide-eg"><b>Tip.</b> {page.tip}</p>}
      </>}

      {page.kind === "article" && <>
        {page.blocks.map((b) => (
          <section key={b.heading}><h2>{b.heading}</h2>{b.text.map((t) => <p key={t}>{t}</p>)}</section>
        ))}
        {page.faq && <Faq items={page.faq} />}
      </>}

      <nav className="guide-pager" aria-label="More in the guide">
        {prev ? <Link href={href(prev.slug)}><span className="cs-k">Previous</span>{prev.title}</Link> : <span />}
        {next ? <Link href={href(next.slug)} className="next"><span className="cs-k">Next</span>{next.title}</Link> : <span />}
      </nav>
    </article>
  );
}

/** Search-engine markup for a page: breadcrumbs, and its questions or steps. */
export function guideLd(page: GuidePage, site: string) {
  const crumbs = { "@type": "BreadcrumbList", itemListElement: [
    { "@type": "ListItem", position: 1, name: "Docs", item: `${site}/docs/` },
    { "@type": "ListItem", position: 2, name: "Guide", item: `${site}${guidePath()}` },
    { "@type": "ListItem", position: 3, name: page.title, item: `${site}${guidePath(page.slug)}` }] };
  const faq = page.kind !== "howto" && page.faq?.length ? [{ "@type": "FAQPage", mainEntity: page.faq.map(([q, a]) =>
    ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) }] : [];
  const howto = page.kind === "howto" ? [{ "@type": "HowTo", name: page.title, description: page.description, totalTime: `PT${page.minutes}M`,
    step: page.steps.map((s, n) => ({ "@type": "HowToStep", position: n + 1, name: s.title, text: s.text })) }] : [];
  return { "@context": "https://schema.org", "@graph": [crumbs, ...faq, ...howto] };
}
