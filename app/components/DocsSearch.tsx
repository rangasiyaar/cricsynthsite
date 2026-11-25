"use client";
// The docs search box at the top of the Guide's and the API reference's sidebars: finds any Guide topic or API endpoint
// as you type; Enter opens the first result.
import { useState } from "react";
import type { SearchItem } from "@/lib/docsSearch";

export default function DocsSearch({ items, placeholder = "Search the docs" }: { items: SearchItem[]; placeholder?: string }) {
  const [q, setQ] = useState("");
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const hits = words.length ? items.filter((h) => words.every((w) => h.hay.includes(w))).slice(0, 8) : [];
  const go = (href: string) => { setQ(""); window.location.href = href; };
  return (
    <div className="ds" onClick={(e) => e.stopPropagation()}>
      <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
      <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} aria-label="Search the docs"
             onKeyDown={(e) => { if (e.key === "Enter" && hits[0]) go(hits[0].href); if (e.key === "Escape") setQ(""); }} />
      {words.length > 0 && (
        <div className="ds-results">
          {hits.length ? hits.map((h) => (
            <a key={h.href} href={h.href} onClick={(e) => { e.preventDefault(); go(h.href); }}><b>{h.title}</b><span>{h.where}</span></a>
          )) : <p>Nothing found.</p>}
        </div>
      )}
    </div>
  );
}
