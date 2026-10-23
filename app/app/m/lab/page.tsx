"use client";
// App MatchSynth Lab (Pro): the website's Lab for one match, re-simulated on the phone.
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { AppBar, AppGate } from "@/components/App";
import ScenarioLab from "@/components/ScenarioLab";
import { loadMatch } from "@/lib/data";
import type { MatchDoc } from "@/lib/types";

const CentreIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z" /></svg>
);

function Lab({ id }: { id: string }) {
  const [doc, setDoc] = useState<MatchDoc | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!id) { setErr("No match selected."); return; }
    loadMatch(id).then(setDoc).catch(() => setErr("This match isn't available in the lab."));
  }, [id]);
  if (err) return <p className="notice">{err}</p>;
  if (!doc) return <div className="skeleton card" style={{ minHeight: 320 }} />;
  return <ScenarioLab key={doc.match.id} doc={doc} />;
}

function Page() {
  const id = useSearchParams().get("id") || "";
  const back = `/m/match/?id=${encodeURIComponent(id)}`;
  return (
    <>
      <AppBar back="/m/matches/" eyebrow={<>MatchSynth Lab <span className="tag pro">Pro</span></>}
              title="Change the match"
              right={id && <Link href={back} className="app-ib" aria-label="Open in Match Centre"><CentreIcon /></Link>} />
      <p className="muted small app-lede">Set the toss, pitch, dew, player form and who&apos;s available, or start from any score. Every tab updates with you.</p>
      <AppGate pro><Lab id={id} /></AppGate>
    </>
  );
}

export default function LabPage() {
  return <Suspense fallback={<div className="skeleton card" style={{ minHeight: 320 }} />}><Page /></Suspense>;
}
