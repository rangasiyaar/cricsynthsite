"use client";
// MatchSynth Lab (Pro): re-simulate any covered match with your own conditions, form and match situation.
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { RequireSignIn } from "@/components/Gate";
import ScenarioLab from "@/components/ScenarioLab";
import Scoreboard from "@/components/Scoreboard";
import { loadIndex, loadMatch } from "@/lib/data";
import type { MatchCard, MatchDoc } from "@/lib/types";

function Lab() {
  const params = useSearchParams();
  const [cards, setCards] = useState<MatchCard[] | null>(null);
  const [id, setId] = useState<string>(params.get("id") || "");
  const [doc, setDoc] = useState<MatchDoc | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    loadIndex().then((ix) => {
      const ms = ix.matches.filter((m) => m.published);
      setCards(ms);
      if (!id && ms.length) setId(ms[0].id);
    }).catch(() => setErr("Matches couldn't be loaded. Please try again."));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!id) return;
    setDoc(null);
    loadMatch(id).then(setDoc).catch(() => setErr("This match isn't available in the lab."));
    const u = new URL(window.location.href);
    u.searchParams.set("id", id);
    window.history.replaceState(null, "", u.toString());
  }, [id]);

  if (err) return <p className="notice">{err}</p>;
  if (cards && !cards.length) return <p className="notice">No matches are open in the lab right now. New fixtures appear here once their forecast is published.</p>;
  return (
    <>
      {cards && cards.length > 1 && (
        <div className="lever" style={{ maxWidth: 420, marginBottom: 20 }}>
          <label htmlFor="lab-match">Match</label>
          <select id="lab-match" value={id} onChange={(e) => setId(e.target.value)}>
            {cards.map((m) => <option key={m.id} value={m.id}>{m.title ?? m.teams.map((t) => t.name).join(" v ")}{m.date ? ` · ${m.date}` : ""}</option>)}
          </select>
        </div>
      )}
      {!doc ? <div className="skeleton card" style={{ minHeight: 320 }} /> : (
        <>
          <Scoreboard doc={doc} />
          <div style={{ marginTop: 28 }}><ScenarioLab doc={doc} /></div>
        </>
      )}
    </>
  );
}

export default function LabPage() {
  return (
    <div className="page-head" style={{ paddingBottom: 80 }}>
      <p className="cs-eyebrow">MatchSynth Lab <span className="tag pro">Pro</span></p>
      <h1><span>Change the match.</span><span>See what moves.</span></h1>
      <p className="cs-lede">Set the toss, pitch, dew, player form and bowler availability, or start from any score. Every change
        re-runs thousands of ball-by-ball simulations in your browser.</p>
      <div style={{ marginTop: 32 }}>
        <RequireSignIn pro>
          <Suspense fallback={<div className="skeleton card" style={{ minHeight: 320 }} />}><Lab /></Suspense>
        </RequireSignIn>
      </div>
    </div>
  );
}
