"use client";
// App match centre: the website's scoreboard and tabs, with MatchSynth Lab as the last tab.
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { AppBar } from "@/components/App";
import { ForecastTabs } from "@/components/MatchCentre";
import Scoreboard from "@/components/Scoreboard";
import { loadMatch } from "@/lib/data";
import { share } from "@/lib/native";
import { SITE } from "@/lib/seo";
import type { MatchDoc } from "@/lib/types";

const LabIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 3h6M10 3v6L4 19a1.5 1.5 0 0 0 1.3 2h13.4a1.5 1.5 0 0 0 1.3-2L14 9V3" /></svg>
);
const ShareIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 15V3M7 8l5-5 5 5M5 13v7h14v-7" /></svg>
);

function Match() {
  const id = useSearchParams().get("id") || "";
  const [doc, setDoc] = useState<MatchDoc | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    if (!id) { setError("No match selected."); return; }
    loadMatch(id).then(setDoc).catch(() => setError("This match's forecast isn't available in the app."));
  }, [id]);

  const short = doc ? doc.match.teams.map((t) => t.short).join(" v ") : "";
  const url = `${SITE}/match/?id=${encodeURIComponent(id)}`;
  const onShare = async () => {
    const r = await share(doc?.match.title ?? short, url);
    if (r === "copied") { setNote("Link copied"); setTimeout(() => setNote(null), 2000); }
  };
  return (
    <>
      <AppBar back="/m/matches/" title={short || "Match centre"} right={doc && (
        <button type="button" className="app-ib" aria-label="Share this match" onClick={onShare}><ShareIcon /></button>
      )} />
      {note && <div className="app-toast" role="status">{note}</div>}
      {error && <div className="notice">{error} <a href={`${SITE}/results/?id=${encodeURIComponent(id)}`}>See the result on the website</a></div>}
      {!doc && !error && <div className="skeleton card" style={{ minHeight: 320 }} />}
      {doc && (
        <div className="app-centre">
          <Scoreboard doc={doc} />
          <ForecastTabs doc={doc} extra={
            <Link role="tab" className="tab-link" href={`/m/lab/?id=${encodeURIComponent(doc.match.id)}`}>
              <span className="mc-ico" aria-hidden="true"><LabIcon /></span>
              <span className="mc-label"><span className="mc-full">MatchSynth Lab</span><span className="mc-short">Lab</span></span>
              <span className="tag pro">Pro</span>
            </Link>} />
          <p className="small muted" style={{ marginTop: 32 }}>Updated {new Date(doc.generated_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</p>
        </div>
      )}
    </>
  );
}

export default function MatchPage() {
  return <Suspense fallback={<div className="skeleton card" style={{ minHeight: 320 }} />}><Match /></Suspense>;
}
