// Docs home: how to use CricSynthesis. A search across every doc page, then two tabs of link cards to the dedicated
// pages: the platform (each Guide topic, for fans) and developers (API reference, playground, MCP, plans).
import type { Metadata } from "next";
import DocsTabs, { type DocsData } from "@/components/DocsTabs";
import { GROUPS, GUIDE, guidePath } from "@/lib/guide";
import { CATEGORIES, ENDPOINTS } from "@/lib/apiref";
import { seo } from "@/lib/seo";

export const metadata: Metadata = seo("/docs/", "How to use CricSynthesis | Docs",
  "How to use CricSynthesis: a guide to every match page section for fans, and the API reference, playground and MCP connector for developers.");

function data(): DocsData {
  return {
    guide: GROUPS.map((g) => ({
      group: g,
      pages: GUIDE.filter((p) => p.group === g).map((p) => ({ href: guidePath(p.slug), title: p.title, short: p.short, pro: p.access === "pro", group: g })),
    })),
    api: CATEGORIES.map((c) => {
      const eps = ENDPOINTS.filter((e) => e.category === c);
      return { name: c, count: eps.length, href: `/docs/api/#${eps[0]?.id ?? ""}`,
        endpoints: eps.map((e) => ({ href: `/docs/api/#${e.id}`, method: e.method, path: e.path, summary: e.summary })) };
    }),
  };
}

export default function Docs() {
  return (
    <div className="page-head docs-home" style={{ paddingBottom: 96 }}>
      <h1><span>How to use CricSynthesis</span></h1>
      <p className="cs-lede">Everything about the match pages, MatchSynth Lab and the API, in one place.</p>
      <DocsTabs data={data()} />
    </div>
  );
}
