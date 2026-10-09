"use client";
import { signOut } from "firebase/auth";
import Link from "next/link";
import { useEffect } from "react";
import { auth, useUser } from "@/lib/firebase";

export default function Account() {
  const user = useUser();
  useEffect(() => { if (user === null) window.location.replace("/login/?next=/account/"); }, [user]);
  if (!user) return <div className="page-head"><p className="muted">Loading…</p></div>;
  const since = user.metadata.creationTime ? new Date(user.metadata.creationTime).toLocaleDateString("en-IN", { dateStyle: "medium" }) : null;
  return (
    <div className="page-head">
      <p className="cs-eyebrow">Account</p>
      <h1><span>{user.displayName || user.email}</span></h1>
      <div className="grid g2" style={{ marginTop: 28 }}>
        <div className="card">
          <h3>Profile</h3>
          <p className="small">Signed in as <b>{user.email}</b>{since && <> · member since {since}</>}</p>
          <button type="button" className="btn ghost" onClick={() => signOut(auth()).then(() => window.location.replace("/"))}>Sign out</button>
        </div>
        <div className="card">
          <h3>Plan <span className="tag pro">Pro · beta</span></h3>
          <p className="small">All Scenario Lab controls are included during the beta.</p>
          <Link href="/#next" className="btn">Matches</Link>
        </div>
        <div className="card">
          <h3>API access</h3>
          <p className="small">API keys are issued on request.</p>
          <Link href="/developers/#request-access" className="btn ghost">Request access</Link>
        </div>
      </div>
      <div style={{ paddingBottom: 80 }} />
    </div>
  );
}
