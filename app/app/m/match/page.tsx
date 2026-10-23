"use client";
// App match centre: the match at a glance and a menu of sections; each section opens on a screen of its own
// (?s=<section>), so the phone's back button returns to the menu.
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Empty, Icon, Loading, MatchHero, MenuGroup, MenuRow, SLUG, TopBar, fromSlug, preview } from "@/components/App";
import { SectionView, TAB_ICONS, sectionsFor, type Section } from "@/components/MatchCentre";
import { loadMatch } from "@/lib/data";
import { FORMAT } from "@/lib/format";
import { share } from "@/lib/native";
import { countdown, kickoffMs, startLabel } from "@/lib/schedule";
import { SITE } from "@/lib/seo";
import type { MatchDoc } from "@/lib/types";

// The doc stays in memory while moving between the menu and its sections.
const cache = new Map<string, MatchDoc>();

function Menu({ doc }: { doc: MatchDoc }) {
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
      </div>
      <MenuGroup label="Match centre">
        {sections.map((s) => (
          <MenuRow key={s} icon={TAB_ICONS[s]} title={s} sub={preview(doc, s)} href={`/m/match/?id=${id}&s=${SLUG[s]}`} />
        ))}
      </MenuGroup>
      <MenuGroup label="What if">
        <MenuRow icon={Icon.lab} tone="accent" title={<>MatchSynth Lab <span className="a-pro">Pro</span></>}
                 sub="Change the toss, pitch, dew or form and re-run the match" href={`/m/lab/?id=${id}`} />
      </MenuGroup>
      <p className="a-version">Updated {new Date(doc.generated_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</p>
    </>
  );
}

function SectionScreen({ doc, section }: { doc: MatchDoc; section: Section }) {
  return (
    <>
      <div className="a-section-head">
        <span className="a-row-icon">{TAB_ICONS[section]}</span>
        <div><h1>{section}</h1><p>{doc.match.teams.map((t) => t.short).join(" v ")} · {preview(doc, section)}</p></div>
      </div>
      <div className="a-content" key={section}><SectionView doc={doc} section={section} /></div>
    </>
  );
}

function Match() {
  const params = useSearchParams();
  const router = useRouter();
  const id = params.get("id") || "";
  const [doc, setDoc] = useState<MatchDoc | null>(cache.get(id) ?? null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    if (!id) { setError("No match selected."); return; }
    if (cache.has(id)) { setDoc(cache.get(id)!); return; }
    loadMatch(id).then((d) => { cache.set(id, d); setDoc(d); }).catch(() => setError("This match's forecast isn't available in the app."));
  }, [id]);
  useEffect(() => { window.scrollTo(0, 0); }, [params]);

  const section = doc ? fromSlug(params.get("s"), sectionsFor(doc)) : null;
  const short = doc ? doc.match.teams.map((t) => t.short).join(" v ") : "Match";
  const onShare = async () => {
    const r = await share(doc?.match.title ?? short, `${SITE}/match/?id=${encodeURIComponent(id)}`);
    if (r === "copied") { setNote("Link copied"); setTimeout(() => setNote(null), 2000); }
  };
  const menu = `/m/match/?id=${encodeURIComponent(id)}`;
  return (
    <>
      <TopBar back={section ? menu : "/m/matches/"} title={section ? `${section} · ${short}` : short}
              right={doc && <button type="button" className="a-icon" aria-label="Share this match" onClick={onShare}>{Icon.share}</button>} />
      {note && <div className="a-toast" role="status">{note}</div>}
      {error && (
        <Empty title="Not available" action={<button type="button" className="a-pill" onClick={() => router.replace("/m/matches/")}>Back to matches</button>}>
          {error} <a href={`${SITE}/results/?id=${encodeURIComponent(id)}`}>See the result on the website</a>.
        </Empty>
      )}
      {!doc && !error && <Loading rows={3} />}
      {doc && (section ? <SectionScreen doc={doc} section={section} /> : <Menu doc={doc} />)}
    </>
  );
}

export default function MatchPage() {
  return <Suspense fallback={<Loading rows={3} />}><Match /></Suspense>;
}
