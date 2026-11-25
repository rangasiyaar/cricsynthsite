// What the docs search box looks through: every Guide topic (opened in the continuous guide) and every API endpoint.
import { GUIDE, guidePath } from "@/lib/guide";
import { ENDPOINTS } from "@/lib/apiref";

export type SearchItem = { href: string; title: string; where: string; hay: string };

export const docsSearchItems = (): SearchItem[] => [
  ...GUIDE.map((p) => ({ href: `${guidePath()}#${p.slug}`, title: p.title, where: `Guide · ${p.group}`,
    hay: `${p.title} ${p.short} ${p.group}`.toLowerCase() })),
  ...ENDPOINTS.map((e) => ({ href: `/docs/api/#${e.id}`, title: e.summary, where: `API · ${e.method} ${e.path}`,
    hay: `${e.summary} ${e.path} ${e.category}`.toLowerCase() })),
  ...[["overview", "Quickstart"], ["authentication", "Authentication"], ["rate-limits", "Rate limits"], ["errors", "Errors"]]
    .map(([id, t]) => ({ href: `/docs/api/#${id}`, title: t, where: "API · Getting started", hay: `${t} api key`.toLowerCase() })),
];
