"use client";
// App MatchSynth Lab (Pro): your scenario at a glance and a menu — "Set the scene" (the levers) and every match-centre
// section rebuilt from your simulations. Each opens on a screen of its own (?s=…); the scenario stays in memory
// across them, and the levers are saved per match on the phone.
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { AppGate, Empty, Icon, Loading, MatchHero, MenuGroup, MenuRow, SLUG, TopBar, fromSlug, preview, snapScreen, useFresh } from "@/components/App";
import { SectionView, TAB_ICONS, sectionsFor } from "@/components/MatchCentre";
import { LabLevers, LabResult, useLab, type Lab } from "@/components/ScenarioLab";
import { loadMatch, peekMatch } from "@/lib/data";
import type { MatchDoc } from "@/lib/types";

function Busy({ lab }: { lab: Lab }) {
  return lab.busy ? <span className="a-lab-busy"><i />Simulating…</span> : null;
}

function LabMenu({ lab, id }: { lab: Lab; id: string }) {
  const doc = lab.labDoc!;
  const q = `/m/lab/?id=${encodeURIComponent(id)}`;
  return (
    <>
      <div className="a-title" style={{ paddingBottom: 14 }}>
        <div className="a-eyebrow">MatchSynth Lab <span className="a-pro">Pro</span></div>
        <h1>{doc.match.teams.map((t) => t.short).join(" v ")}</h1>
      </div>
      <MatchHero doc={doc} note={<Busy lab={lab} />} />
      <div className="a-lab-card">
        <LabResult lab={lab} movers={false} />
      </div>
      <MenuGroup label="Your scenario">
        <MenuRow icon={Icon.scene} tone="accent" title="Set the scene" href={`${q}&s=scene`}
                 sub={lab.changes ? `${lab.changes} change${lab.changes === 1 ? "" : "s"}` : "As published"} />
      </MenuGroup>
      <MenuGroup label="Results of your scenario">
        {sectionsFor(doc).map((s) => (
          <MenuRow key={s} icon={TAB_ICONS[s]} title={s} sub={preview(doc, s) || undefined} href={`${q}&s=${SLUG[s]}`} />
        ))}
      </MenuGroup>
    </>
  );
}

function Scene({ lab, id }: { lab: Lab; id: string }) {
  return (
    <>
      <div className="a-section-head">
        <span className="a-row-icon accent">{Icon.scene}</span>
        <div><h1>Set the scene</h1></div>
      </div>
      <div className="a-lab-card"><LabResult lab={lab} movers /></div>
      <div className="a-levers"><LabLevers lab={lab} /></div>
      <div className="a-sticky-cta">
        <button type="button" className="a-btn soft" onClick={lab.reset} disabled={!lab.changed}>Reset</button>
        <a className="a-btn" href={`/m/lab/?id=${encodeURIComponent(id)}`} onClick={(e) => { e.preventDefault(); snapScreen(true); window.history.back(); }}>See results</a>
      </div>
    </>
  );
}

function LabScreens({ doc }: { doc: MatchDoc }) {
  const params = useSearchParams();
  const lab = useLab(doc);
  const slug = params.get("s");
  if (lab.err) return <Empty title="Lab unavailable">{lab.err}</Empty>;
  if (!lab.ready || !lab.labDoc) return <Loading rows={3} />;
  if (slug === "scene") return <Scene lab={lab} id={doc.match.id} />;
  const section = fromSlug(slug, sectionsFor(lab.labDoc));
  if (!section) return <LabMenu lab={lab} id={doc.match.id} />;
  return (
    <>
      <div className="a-section-head">
        <span className="a-row-icon">{TAB_ICONS[section]}</span>
        <div><h1>{section}</h1><p>Your scenario {lab.busy && <>· <Busy lab={lab} /></>}</p></div>
      </div>
      <div className="a-content" key={section} style={{ opacity: lab.busy ? 0.6 : 1, transition: "opacity .2s" }}>
        <SectionView doc={lab.labDoc} section={section} live={false} />
      </div>
    </>
  );
}

function Page() {
  const params = useSearchParams();
  const id = params.get("id") || "";
  const slug = params.get("s");
  // the Lab keeps the first copy it gets: a refreshed doc would restart the simulations mid-scenario
  const fresh = useFresh(id || null, () => peekMatch(id), () => loadMatch(id));
  const [doc, setDoc] = useState<MatchDoc | null>(null);
  useEffect(() => { if (fresh.data && !doc) setDoc(fresh.data); }, [fresh.data, doc]);
  const err = !id ? "No match selected." : fresh.error ? "This match isn't available in the lab." : null;
  const menu = `/m/lab/?id=${encodeURIComponent(id)}`;
  return (
    <>
      <TopBar back={slug ? menu : `/m/match/?id=${encodeURIComponent(id)}`} />
      <AppGate pro>
        {err ? <Empty title="Lab unavailable">{err}</Empty> : !doc ? <Loading rows={3} /> : <LabScreens doc={doc} />}
      </AppGate>
    </>
  );
}

export default function LabPage() {
  return <Suspense fallback={<Loading rows={3} />}><Page /></Suspense>;
}
