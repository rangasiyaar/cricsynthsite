"use client";
// App match centre: the match at a glance and a menu of sections; each section opens on a screen of its own
// (?s=<section>), so the phone's back button returns to the menu.
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { Empty, Icon, Loading, MatchHero, MenuGroup, MenuRow, OfflineBar, SLUG, SwipeNav, TopBar, XiTag, fromSlug, preview, useFresh } from "@/components/App";
import { SectionView, TAB_ICONS, sectionName, sectionsFor, type Section } from "@/components/MatchCentre";
import { loadMatch, peekMatch } from "@/lib/data";
import { FORMAT } from "@/lib/format";
import { countdown, kickoffMs, startLabel } from "@/lib/schedule";
import { SITE } from "@/lib/seo";
import { resultPath } from "@/lib/matchText";
import type { MatchDoc } from "@/lib/types";

function Menu({ doc, xiNew }: { doc: MatchDoc; xiNew?: boolean }) {
  const id = encodeURIComponent(doc.match.id);
  const sections = sectionsFor(doc);
  const left = countdown(kickoffMs(doc.match.date, doc.match.start_time), Date.now());
  return (
    <>
      <div className="a-title" style={{ paddingBottom: 14 }}>
        <div className="a-eyebrow">{doc.match.competition ?? FORMAT[doc.match.format] ?? doc.match.format}</div>
        <h1>{doc.match.teams.map((t) => t.short).join(" v ")}</h1>
      </div>
      <MatchHero doc={doc} />
      <div className="a-facts">
        {doc.match.venue && <span className="a-fact">{doc.match.venue}</span>}
        {doc.match.date && <span className="a-fact">{startLabel(doc.match.date, doc.match.start_time)}</span>}
        {left && <span className="a-fact ok">Starts in {left}</span>}
        <XiTag xis={doc.match.xis} at={doc.generated_at} fresh={xiNew} />
      </div>
      <MenuGroup label="Match centre">
        {sections.map((s) => (
          <MenuRow key={s} icon={TAB_ICONS[s]} title={sectionName(s)} sub={preview(doc, s) || undefined} href={`/m/match/?id=${id}&s=${SLUG[s]}`} />
        ))}
      </MenuGroup>
      <MenuGroup label="What if">
        <MenuRow icon={Icon.lab} tone="accent" title={<>MatchSynth Lab <span className="a-pro">Pro</span></>}
                 href={`/m/lab/?id=${id}`} />
      </MenuGroup>
    </>
  );
}

function SectionScreen({ doc, section }: { doc: MatchDoc; section: Section }) {
  const list = sectionsFor(doc), i = list.indexOf(section);
  const near = (d: number) => { const s = list[i + d]; return s ? `/m/match/?id=${encodeURIComponent(doc.match.id)}&s=${SLUG[s]}` : null; };
  return (
    <>
      <div className="a-section-head">
        <span className="a-row-icon">{TAB_ICONS[section]}</span>
        <div><h1>{sectionName(section)}</h1>{preview(doc, section) && <p>{preview(doc, section)}</p>}
          {(section === "Fantasy" || section === "Players") && <div style={{ marginTop: 6 }}><XiTag xis={doc.match.xis} at={doc.generated_at} /></div>}</div>
      </div>
      <SwipeNav prev={near(-1)} next={near(1)}>
        <div className="a-content" key={section}><SectionView doc={doc} section={section} /></div>
      </SwipeNav>
    </>
  );
}

function Match() {
  const params = useSearchParams();
  const router = useRouter();
  const id = params.get("id") || "";
  const fresh = useFresh(id || null, () => peekMatch(id), () => loadMatch(id));
  const doc = fresh.data;
  const error = !id ? "No match selected." : fresh.error ? "This match's forecast isn't available in the app." : null;

  // until the XIs are named, look for them every 2 minutes from an hour before the start; flash the tag when they land
  const [xiNew, setXiNew] = useState(false);
  const hadXis = useRef<boolean | null>(null);
  const refresh = fresh.refresh;
  useEffect(() => {
    if (!doc) return;
    const xis = !!doc.match.xis;
    if (hadXis.current === false && xis) { setXiNew(true); setTimeout(() => setXiNew(false), 4000); }
    hadXis.current = xis;
    const k = kickoffMs(doc.match.date, doc.match.start_time);
    if (xis || k === null || Date.now() < k - 3_600_000 || Date.now() > k + 4 * 3_600_000) return;
    const t = setInterval(refresh, 120_000);
    return () => clearInterval(t);
  }, [doc, refresh]);

  const section = doc ? fromSlug(params.get("s"), sectionsFor(doc)) : null;
  const menu = `/m/match/?id=${encodeURIComponent(id)}`;
  return (
    <>
      <TopBar back={section ? menu : "/m/matches/"} />
      <OfflineBar show={fresh.offline} onRetry={fresh.refresh} />
      {error && (
        <Empty title="Not available" action={<button type="button" className="a-pill" onClick={() => router.replace("/m/matches/")}>Back to matches</button>}>
          {error} <a href={`${SITE}${resultPath(id)}`}>See the result on the website</a>.
        </Empty>
      )}
      {!doc && !error && <Loading rows={3} />}
      {doc && (section ? <SectionScreen doc={doc} section={section} /> : <Menu doc={doc} xiNew={xiNew} />)}
    </>
  );
}

export default function MatchPage() {
  return <Suspense fallback={<Loading rows={3} />}><Match /></Suspense>;
}
