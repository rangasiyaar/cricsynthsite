"use client";
// The continuous guide's frame: a sticky sidebar listing every topic that highlights the one you're reading and keeps
// it in view as you scroll, an "On this page" list for that topic's parts (wide screens), and a Contents button on
// phones (website and app). Clicks scroll smoothly and update the address (#topic), so links can point anywhere.
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

export type Outline = { slug: string; title: string; group: string; access?: "free" | "pro"; subs: { id: string; title: string }[] }[];

const OFFSET = 110;     // fallback reading line (px from the top) when an element has no scroll-margin

export default function GuideShell({ outline, app = false, children }: { outline: Outline; app?: boolean; children: React.ReactNode }) {
  const [topic, setTopic] = useState(outline[0]?.slug ?? "");
  const [part, setPart] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const side = useRef<HTMLElement>(null);

  // which topic and part are at the reading line
  useEffect(() => {
    let raf = 0;
    // an element is "being read" once its top reaches the line it scrolls to (its scroll-margin, i.e. under the sticky bars)
    const reached = (el: HTMLElement, slack: number) =>
      el.getBoundingClientRect().top <= (parseFloat(getComputedStyle(el).scrollMarginTop) || OFFSET) + slack;
    const update = () => {
      raf = 0;
      const atEnd = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
      let cur = outline[0]?.slug ?? "";
      if (atEnd && outline.length) cur = outline[outline.length - 1].slug;     // the last topic can't reach the top
      else for (const o of outline) {
        const el = document.getElementById(o.slug);
        if (el && reached(el, 24)) cur = o.slug; else if (el) break;
      }
      setTopic(cur);
      const subs = outline.find((o) => o.slug === cur)?.subs ?? [];
      let p: string | null = null;
      for (const s of subs) {
        const el = document.getElementById(s.id);
        if (el && reached(el, 48)) p = s.id; else if (el) break;
      }
      if (atEnd && subs.length) p = subs[subs.length - 1].id;
      setPart(p);
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => { window.removeEventListener("scroll", onScroll); window.removeEventListener("resize", onScroll); if (raf) cancelAnimationFrame(raf); };
  }, [outline]);

  // keep the current topic visible inside the sidebar as it moves along
  useEffect(() => {
    const box = side.current, link = box?.querySelector<HTMLElement>(`[data-slug="${topic}"]`);
    if (!box || !link) return;
    const top = link.offsetTop - box.offsetTop, bottom = top + link.offsetHeight;
    if (top < box.scrollTop + 40) box.scrollTo({ top: Math.max(0, top - 80), behavior: "smooth" });
    else if (bottom > box.scrollTop + box.clientHeight - 40) box.scrollTo({ top: bottom - box.clientHeight + 80, behavior: "smooth" });
  }, [topic]);

  // a link to #topic opens there (also after the app renders the guide on the phone)
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (id) setTimeout(() => document.getElementById(id)?.scrollIntoView(), 60);
  }, []);

  const go = useCallback((id: string) => (e: React.MouseEvent) => {
    const el = document.getElementById(id);
    if (!el) return;
    e.preventDefault();
    setOpen(false);
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    history.replaceState(null, "", `#${id}`);
  }, []);

  const groups = [...new Set(outline.map((o) => o.group))];
  const current = outline.find((o) => o.slug === topic);
  const list = (
    <>
      {groups.map((g) => (
        <div key={g} className="guide-nav-group">
          <p className="cs-k">{g}</p>
          {outline.filter((o) => o.group === g).map((o) => (
            <a key={o.slug} href={`#${o.slug}`} data-slug={o.slug} onClick={go(o.slug)} className={o.slug === topic ? "on" : undefined}
               aria-current={o.slug === topic ? "location" : undefined}>{o.title}{o.access === "pro" && <span className="guide-nav-pro">Pro</span>}</a>
          ))}
        </div>
      ))}
    </>
  );

  return (
    <div className={`guide-doc${app ? " guide-doc-app" : ""}`}>
      {!app && (
        <nav className="guide-nav guide-doc-side" ref={side} aria-label="Guide contents">
          <Link href="/docs/" className="guide-nav-docs">Docs</Link>
          {list}
          <Link href="/docs/api/" className="guide-nav-api">API reference</Link>
        </nav>
      )}

      <div className="guide-doc-main">
        <div className="guide-contents-bar">
          <button type="button" className="guide-contents-btn" aria-expanded={open} onClick={() => setOpen(!open)}>
            <span className="cs-k">Contents</span><span className="guide-contents-cur">{current?.title}</span>
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
          </button>
          {open && <nav className="guide-contents-list" aria-label="Guide contents">{list}</nav>}
        </div>
        {children}
      </div>

      {!app && (
        <aside className="guide-onpage" aria-label="On this page">
          {current && current.subs.length > 0 && <>
            <p className="cs-k">On this page</p>
            <a href={`#${current.slug}`} onClick={go(current.slug)} className={part === null ? "on" : undefined}>{current.title}</a>
            {current.subs.map((s) => (
              <a key={s.id} href={`#${s.id}`} onClick={go(s.id)} className={`sub${part === s.id ? " on" : ""}`}>{s.title}</a>
            ))}
          </>}
        </aside>
      )}
    </div>
  );
}
