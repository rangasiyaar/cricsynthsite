"use client";
// App match centre: the match at a glance and a menu of sections; each section opens on a screen of its own
// (?s=<section>), so the phone's back button returns to the menu.
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Empty, Icon, Loading, MatchHero, MenuGroup, MenuRow, OfflineBar, SLUG, TopBar, fromSlug, preview, useFresh } from "@/components/App";
import { SectionView, TAB_ICONS, sectionsFor, type Section } from "@/components/MatchCentre";
import { loadMatch, peekMatch } from "@/lib/data";
import { FORMAT } from "@/lib/format";
import { share } from "@/lib/native";
import { countdown, kickoffMs, startLabel } from "@/lib/schedule";
import { SITE } from "@/lib/seo";
import type { MatchDoc } from "@/lib/types";

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
          <MenuRow key={s} icon={TAB_ICONS[s]} title={s} sub={preview(doc, s) || undefined} href={`/m/match/?id=${id}&s=${SLUG[s]}`} />
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
  return (
    <>
      <div className="a-section-head">
        <span className="a-row-icon">{TAB_ICONS[section]}</span>
        <div><h1>{section}</h1>{preview(doc, section) && <p>{preview(doc, section)}</p>}</div>
      </div>
      <div className="a-content" key={section}><SectionView doc={doc} section={section} /></div>
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
  const [note, setNote] = useState<string | null>(null);

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
      <OfflineBar show={fresh.offline} onRetry={fresh.refresh} />
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
