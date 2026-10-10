"use client";
import { signOut } from "firebase/auth";
import Link from "next/link";
import { useEffect } from "react";
import { auth, usePlan } from "@/lib/firebase";

export default function Account() {
  const { user, plan, source } = usePlan();
  useEffect(() => { if (user === null) window.location.replace("/login/?next=/account/"); }, [user]);
  if (!user) return <div className="page-head"><p className="muted">Loading…</p></div>;
  const since = user.metadata.creationTime ? new Date(user.metadata.creationTime).toLocaleDateString("en-IN", { dateStyle: "medium" }) : null;
  return (
    <div className="page-head">
      <p className="cs-eyebrow">Account</p>
      <h1><span>{user.displayName || user.email}</span></h1>
      <div className="grid g3" style={{ marginTop: 28 }}>
        <div className="card">
          <h3>Profile</h3>
          <p className="small">Signed in as <b>{user.email}</b>{since && <> · member since {since}</>}</p>
          <div className="card-foot"><button type="button" className="btn ghost" onClick={() => signOut(auth()).then(() => window.location.replace("/"))}>Sign out</button></div>
        </div>
        <div className="card">
          <h3>Plan {plan === "pro" ? <span className="tag pro">Pro{source === "beta" ? " · beta" : ""}</span> : <span className="tag">Free</span>}</h3>
          <p className="small">{plan === "pro"
            ? source === "beta" ? "Pro is free for every account during the beta, including MatchSynth Lab." : "Your Pro subscription includes MatchSynth Lab."
            : "Forecasts and the match centre. Pro adds MatchSynth Lab."}</p>
          <div className="card-foot"><Link href={plan === "pro" ? "/lab/" : "/pricing/"} className="btn">{plan === "pro" ? "Open MatchSynth Lab" : "See plans"}</Link></div>
        </div>
        <div className="card">
          <h3>API access</h3>
          <p className="small">API keys are issued on request.</p>
          <div className="card-foot"><Link href="/developers/#request-access" className="btn ghost">Request access</Link></div>
        </div>
      </div>
      <div style={{ paddingBottom: 80 }} />
    </div>
  );
}
