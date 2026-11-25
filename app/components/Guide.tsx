// The Guide (content in lib/guide.ts). Two ways to read it:
//   - GuideDoc: the whole guide as one continuous document (/docs/guide/, app /m/guide/), with a sticky sidebar and an
//     "On this page" list that follow you as you scroll (GuideShell);
//   - GuideArticle: one topic on its own page (/docs/guide/<slug>/, app /m/guide/?p=<slug>), kept for search and sharing.
// Both render the same topic body (TopicBody). `app` switches links to the app's screens.
import Link from "next/link";
import GuideExample from "@/components/GuideExample";
import GuideShell, { type Outline } from "@/components/GuideShell";
import DocsSearch from "@/components/DocsSearch";
import { docsSearchItems } from "@/lib/docsSearch";
import { GROUPS, GUIDE, appGuidePath, guidePath, type GuidePage } from "@/lib/guide";

const linkFor = (app: boolean) => (slug?: string) => (app ? appGuidePath(slug) : guidePath(slug));

export function AccessTag({ access }: { access?: "free" | "pro" }) {
  if (!access) return null;
  return access === "pro" ? <span className="tag pro">Pro</span> : <span className="tag">Free</span>;
}

/** The sub-headings of a topic, in order (ids are unique across the whole document). */
function subsOf(p: GuidePage): { id: string; title: string }[] {
  const s = (key: string, title: string) => ({ id: `${p.slug}--${key}`, title });
  if (p.kind === "analysis") return [s("page", "On the page"), s("reading", "Reading it"), s("using", "Using it"), s("watch", "Watch out for"),
    ...(p.faq.length ? [s("questions", "Questions")] : [])];
  if (p.kind === "howto") return p.steps.map((st, n) => s(`step-${n + 1}`, st.title));
  return [...p.blocks.map((b, n) => s(`part-${n + 1}`, b.heading)), ...(p.faq?.length ? [s("questions", "Questions")] : [])];
}

export const outline = (): Outline => GUIDE.map((p) => ({ slug: p.slug, title: p.title, group: p.group, access: p.access, subs: subsOf(p) }));

function List({ items, ordered = false }: { items: string[]; ordered?: boolean }) {
  const T = ordered ? "ol" : "ul";
  return <T className="guide-list">{items.map((t) => <li key={t}>{t}</li>)}</T>;
}

/** A topic's content. `doc`: inside the continuous guide (topic heading h2, parts h3, anchors in the page). */
function TopicBody({ page, app, doc }: { page: GuidePage; app: boolean; doc: boolean }) {
  const H = doc ? "h3" : "h2";
  const subs = subsOf(page);
  const id = (key: string) => (doc ? subs.find((x) => x.id === `${page.slug}--${key}`)?.id : undefined);
  const to = (slug: string) => (doc ? `#${slug}` : linkFor(app)(slug));
  const example = page.kind === "analysis" ? (page.section ?? page.sections?.[0]) : undefined;
  const faq = (items: [string, string][]) => (
    <section id={id("questions")} className="guide-part">
      <H>Questions</H>
      <div className="guide-faq">{items.map(([q, a]) => <details key={q}><summary>{q}</summary><p>{a}</p></details>)}</div>
    </section>
  );
  return <>
    <p className="guide-lede">{page.kind === "analysis" ? page.what : page.intro}
      {page.kind === "howto" && <span className="muted"> About {page.minutes} minutes.</span>}</p>
    {page.access === "pro" && <p className="guide-pro small">Part of CricSynthesis Pro. <Link href={app ? "/m/pro/" : "/pro/"}>Get Pro</Link></p>}

    {page.kind === "analysis" && <>
      <section id={id("page")} className="guide-part"><H>On the page</H><List items={page.see} ordered />
        {example && (doc
          ? <details className="guide-example-toggle"><summary>Show a live example</summary><GuideExample section={example} app={app} lazy /></details>
          : <GuideExample section={example} app={app} />)}</section>
      <section id={id("reading")} className="guide-part"><H>Reading it</H>{page.read.map((t) => <p key={t}>{t}</p>)}
        {page.example && <p className="guide-eg"><b>Example.</b> {page.example}</p>}</section>
      <section id={id("using")} className="guide-part"><H>Using it</H><List items={page.decide} /></section>
      <section id={id("watch")} className="guide-part"><H>Watch out for</H><List items={page.mistakes} /></section>
      {page.faq.length > 0 && faq(page.faq)}
    </>}

    {page.kind === "howto" && <>
      <ol className="guide-steps">
        {page.steps.map((s, n) => (
          <li key={s.title} id={id(`step-${n + 1}`)}>
            <span className="guide-step-n" aria-hidden="true">{n + 1}</span>
            <div><h4>{s.title}</h4><p>{s.text}</p>
              {s.page && <a className="small" href={to(s.page)}>More on {GUIDE.find((p) => p.slug === s.page)?.title.toLowerCase()}</a>}</div>
          </li>
        ))}
      </ol>
      {page.tip && <p className="guide-eg"><b>Tip.</b> {page.tip}</p>}
    </>}

    {page.kind === "article" && <>
      {page.blocks.map((b, n) => (
        <section key={b.heading} id={id(`part-${n + 1}`)} className="guide-part"><H>{b.heading}</H>{b.text.map((t) => <p key={t}>{t}</p>)}</section>
      ))}
      {page.faq && page.faq.length > 0 && faq(page.faq)}
    </>}
  </>;
}

/** The whole guide as one document. */
export function GuideDoc({ app = false }: { app?: boolean }) {
  return (
    <GuideShell outline={outline()} app={app} search={app ? undefined : docsSearchItems()}>
      <header className="guide-doc-head">
        {!app && <p className="small muted guide-crumbs"><Link href="/docs/">Docs</Link> / Guide</p>}
        <h1>Guide</h1>
        <p className="guide-lede">What every number on a match page means, and how to use it. Read it top to bottom, or jump to a
          topic from the contents.</p>
      </header>
      {GROUPS.map((g) => (
        <div key={g} className="guide-doc-group">
          <p className="cs-k guide-doc-group-label">{g}</p>
          {GUIDE.filter((p) => p.group === g).map((p) => (
            <section key={p.slug} id={p.slug} className="guide-topic">
              <div className="guide-title"><h2>{p.title}</h2><AccessTag access={p.access} /></div>
              <TopicBody page={p} app={app} doc />
            </section>
          ))}
        </div>
      ))}
    </GuideShell>
  );
}

/** The website's left-hand list on a single topic page. */
export function GuideNav({ current }: { current?: string }) {
  return (
    <nav className="guide-nav" aria-label="Guide">
      <DocsSearch items={docsSearchItems()} />
      <Link href="/docs/" className="guide-nav-docs">Docs</Link>
      <Link href={guidePath()} className="guide-nav-home">Full guide</Link>
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

/** One topic on its own page. */
export function GuideArticle({ page, app = false }: { page: GuidePage; app?: boolean }) {
  const href = linkFor(app);
  const i = GUIDE.findIndex((p) => p.slug === page.slug);
  const prev = GUIDE[i - 1], next = GUIDE[i + 1];
  const full = app ? `/m/guide/#${page.slug}` : `${guidePath()}#${page.slug}`;
  return (
    <article className="guide-article">
      {!app && <p className="small muted guide-crumbs"><Link href="/docs/">Docs</Link> / <Link href={guidePath()}>Guide</Link> / {page.group}</p>}
      <div className="guide-title"><h1>{page.title}</h1><AccessTag access={page.access} /></div>
      <TopicBody page={page} app={app} doc={false} />
      <p className="small guide-full"><a href={full}>Read this in the full guide</a></p>
      <nav className="guide-pager" aria-label="More in the guide">
        {prev ? <Link href={href(prev.slug)}><span className="cs-k">Previous</span>{prev.title}</Link> : <span />}
        {next ? <Link href={href(next.slug)} className="next"><span className="cs-k">Next</span>{next.title}</Link> : <span />}
      </nav>
    </article>
  );
}

/** Search-engine markup for a topic page: breadcrumbs, and its questions or steps. */
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
