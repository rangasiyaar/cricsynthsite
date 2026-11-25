"use client";
// A live example for a guide page: the real section from a recent finished match (so nothing a Pro member pays for
// before a match is given away), with a link to open it on that match. Website and app.
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { SectionView, sectionsFor } from "@/components/MatchCentre";
import { loadMatch, loadResults } from "@/lib/data";
import { matchPath } from "@/lib/matchText";
import type { MatchDoc } from "@/lib/types";
import type { GuideSection } from "@/lib/guide";

const fmt = (d?: string) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "");
const APP_SLUG: Record<GuideSection, string> = { Overview: "overview", Scores: "scores", Wickets: "wickets", Players: "players",
  "Top players": "top", MVP: "mvp", Matchups: "matchups", "Venue intelligence": "venue", Fantasy: "fantasy" };

// one download of the results list and each match for every example on the page
let resultsP: ReturnType<typeof loadResults> | null = null;
const matchP = new Map<string, Promise<MatchDoc>>();
async function pick(section: GuideSection): Promise<MatchDoc | null> {
  resultsP ??= loadResults();
  for (const r of (await resultsP).matches.slice(0, 8)) {
    try {
      if (!matchP.has(r.id)) matchP.set(r.id, loadMatch(r.id));
      const d = await matchP.get(r.id)!;
      if (sectionsFor(d).includes(section)) return d;
    } catch { /* try the next one */ }
  }
  return null;
}

/** `lazy`: wait until the example is near the screen (the continuous guide has many). */
export default function GuideExample({ section, app = false, lazy = false }: { section: GuideSection; app?: boolean; lazy?: boolean }) {
  const [doc, setDoc] = useState<MatchDoc | null | undefined>(undefined);
  const [near, setNear] = useState(!lazy);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (near || !box.current) return;
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { setNear(true); io.disconnect(); } }, { rootMargin: "800px 0px" });
    io.observe(box.current);
    return () => io.disconnect();
  }, [near]);
  useEffect(() => {
    if (!near) return;
    let live = true;
    pick(section).then((d) => { if (live) setDoc(d); }).catch(() => { if (live) setDoc(null); });
    return () => { live = false; };
  }, [section, near]);

  if (doc === null) return null;
  if (doc === undefined) return <div className="guide-example" ref={box}><div className="skeleton card" style={{ minHeight: 220 }} aria-busy="true" /></div>;
  const title = doc.match.title ?? doc.match.teams.map((t) => t.name).join(" v ");
  const tabHref = (s: GuideSection) => (app ? `/m/match/?id=${encodeURIComponent(doc.match.id)}&s=${APP_SLUG[s]}`
    : `${matchPath(doc.match.id)}?tab=${encodeURIComponent(s.toLowerCase())}`);
  const href = tabHref(section);
  return (
    <figure className="guide-example">
      <figcaption className="guide-example-cap">
        <span>Example: {title}{doc.match.date ? `, ${fmt(doc.match.date)}` : ""} (our forecast before the start)</span>
        <Link href={href}>Open on the match</Link>
      </figcaption>
      <div className="guide-example-body"><SectionView doc={doc} section={section} live={false} hrefFor={(t) => tabHref(t as GuideSection)} /></div>
    </figure>
  );
}
