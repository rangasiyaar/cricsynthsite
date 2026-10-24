"use client";
// Pieces of the /app/ page that need the browser: the download button (version and size from /download/app.json)
// and a phone showing the app's match list with the forecasts that are live right now.
import { useEffect, useState } from "react";
import { Logo } from "@/components/Shell";
import { APK_URL, sizeMB, useAppInfo } from "@/lib/appDownload";
import { loadIndex } from "@/lib/data";
import type { MatchIndex } from "@/lib/types";

export function DownloadButton({ ghost }: { ghost?: boolean }) {
  const info = useAppInfo();
  if (info === null) return <span className={`btn${ghost ? " ghost" : ""}`} aria-disabled="true" style={{ opacity: .6, cursor: "default" }}>Coming soon</span>;
  return (
    <a className={`btn${ghost ? " ghost" : ""}`} href={APK_URL} download>
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></svg>
      Download for Android{info ? ` · ${sizeMB(info.bytes)}` : ""}
    </a>
  );
}

export function VersionLine() {
  const info = useAppInfo();
  if (!info) return <p className="small muted" style={{ marginTop: 14 }}>Free · Android 7.0 or newer</p>;
  return <p className="small muted" style={{ marginTop: 14 }}>Version {info.version} (build {info.build}) · Free · Android 7.0 or newer</p>;
}

type M = MatchIndex["matches"][number];

function Card({ m }: { m: M }) {
  const [a, b] = m.teams;
  const pa = m.win?.[a.name], pb = m.win?.[b.name];
  return (
    <div className="phone-card">
      <div className="phone-card-head"><span className="phone-pill">{m.format}</span><span>{m.competition ?? ""}</span></div>
      {[a, b].map((t, i) => {
        const p = i === 0 ? pa : pb;
        return (
          <div key={t.name} className={`phone-team t${i}`}>
            <span className="phone-badge">{t.short}</span><span className="phone-name">{t.name}</span>
            {p != null && <span className="phone-pct">{Math.round(p * 100)}%</span>}
          </div>
        );
      })}
      {pa != null && pb != null && <div className="phone-bar"><i style={{ flex: pa }} /><i style={{ flex: pb }} /></div>}
      <div className="phone-act"><span>MatchSynth Lab</span></div>
    </div>
  );
}

export function PhonePreview() {
  const [matches, setMatches] = useState<M[] | null>(null);
  useEffect(() => { loadIndex().then((d) => setMatches(d.matches.slice(0, 3))).catch(() => setMatches([])); }, []);
  return (
    <div className="phone" aria-hidden="true">
      <div className="phone-screen">
        <div className="phone-top"><span className="phone-brand"><Logo /><span>Cric<b>Synthesis</b></span></span><span className="phone-burger"><i /><i /><i /></span></div>
        <div className="phone-eyebrow">Match centre</div>
        <div className="phone-title">Matches</div>
        <div className="phone-chips"><span className="on">All</span><span>Upcoming</span><span>Live</span><span>Finished</span></div>
        {matches === null && <div className="phone-card phone-skel" />}
        {matches?.map((m) => <Card key={m.id} m={m} />)}
        {matches?.length === 0 && <div className="phone-card"><div className="phone-name">New forecasts appear here before every match.</div></div>}
      </div>
    </div>
  );
}
