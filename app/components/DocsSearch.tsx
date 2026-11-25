"use client";
// Docs home search: finds any Guide topic or API endpoint as you type (Enter opens the first). Also keeps old links
// working: /docs/#developers scrolls to the developer list, and old API anchors (/docs/#match-forecast) go to the
// API reference.
import { useEffect, useState } from "react";
import Link from "next/link";

export type SearchItem = { href: string; title: string; where: string; hay: string };

export default function DocsSearch({ items }: { items: SearchItem[] }) {
  const [q, setQ] = useState("");
  useEffect(() => {
    const read = () => {
      const h = decodeURIComponent(window.location.hash.slice(1));
      if (!h || document.getElementById(h)) return;
      if (h === "platform") document.getElementById("using")?.scrollIntoView();
      else window.location.replace(`/docs/api/#${h}`);
    };
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const hits = words.length ? items.filter((h) => words.every((w) => h.hay.includes(w))).slice(0, 8) : [];
  return (
    <div className="dh-search">
      <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
      <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the docs: win chance, fantasy, player rating…"
             aria-label="Search the docs" onKeyDown={(e) => { if (e.key === "Enter" && hits[0]) window.location.href = hits[0].href; }} />
      {words.length > 0 && (
        <div className="dh-results">
          {hits.length ? hits.map((h) => <Link key={h.href + h.title} href={h.href}><b>{h.title}</b><span>{h.where}</span></Link>)
            : <p>Nothing found. Try the <Link href="/docs/guide/">full guide</Link>.</p>}
        </div>
      )}
    </div>
  );
}
