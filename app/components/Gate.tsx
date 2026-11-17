"use client";
// Gates for pages that need an account or Pro: signed-out visitors go to sign-in and come straight back;
// signed-in accounts without Pro see what Pro adds and how to get it.
import Link from "next/link";
import { useEffect } from "react";
import { usePlan } from "@/lib/firebase";

function here() {
  return typeof window === "undefined" ? "/" : window.location.pathname + window.location.search;
}

export function loginHref(next?: string) {
  return `/login/?next=${encodeURIComponent(next ?? here())}`;
}

/** "<feature> is part of Pro": the same banner for the match-centre tabs and MatchSynth Lab. Guests get a sign-in
 *  button that comes straight back; signed-in accounts without Pro get the plans. */
export function ProBanner({ feature, signedIn, style }: { feature: string; signedIn: boolean; style?: React.CSSProperties }) {
  return (
    <div className="card" style={{ maxWidth: 640, ...style }}>
      <h3>{feature} is part of Pro <span className="tag pro">Pro</span></h3>
      <p className="small muted">The Overview is free for every match. Pro opens the full match centre (scores, wickets,
        players, top players, MVP, match-ups, venue intelligence and fantasy) and MatchSynth Lab.
        {!signedIn && " Pro is free during the beta: sign in to open it."}</p>
      {signedIn ? <Link className="btn" href="/pricing/">See plans</Link> : <Link className="btn" href={loginHref()}>Sign in to open</Link>}
    </div>
  );
}

/** `pro`: guests and accounts without Pro see the Pro banner; otherwise guests go to sign-in and come straight back. */
export function RequireSignIn({ children, pro = false, feature = "MatchSynth Lab" }: { children: React.ReactNode; pro?: boolean; feature?: string }) {
  const { user, plan } = usePlan();
  useEffect(() => { if (user === null && !pro) window.location.replace(loginHref()); }, [user, pro]);
  if (plan === undefined) return <div className="skeleton card" style={{ minHeight: 280 }} aria-busy="true" />;
  if (pro && plan !== "pro") return <ProBanner feature={feature} signedIn={!!user} />;
  if (user === null) return <div className="skeleton card" style={{ minHeight: 280 }} aria-busy="true" />;
  return <>{children}</>;
}
