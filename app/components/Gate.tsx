"use client";
// Gates for pages that need an account or Pro: signed-out visitors go to sign-in and come straight back;
// signed-in accounts without Pro see what Pro adds and how to get it.
import Link from "next/link";
import { useEffect } from "react";
import { usePlan } from "@/lib/firebase";
import { BETA_LINE, FREE_LINE, PITCH, PRO_LINE } from "@/lib/procopy";

function here() {
  return typeof window === "undefined" ? "/" : window.location.pathname + window.location.search;
}

export function loginHref(next?: string) {
  return `/login/?next=${encodeURIComponent(next ?? here())}`;
}

/** The Pro banner for a locked match-centre section or MatchSynth Lab ("Lab"); copy in lib/procopy.ts. Guests get a
 *  sign-in button that comes straight back; signed-in accounts without Pro get the plans. */
export function ProBanner({ section, label, signedIn, style }: { section: string; label: string; signedIn: boolean; style?: React.CSSProperties }) {
  const pitch = PITCH[section] ?? { title: `${label} is part of Pro.`, body: "" };
  return (
    <div className="card pro-banner" style={{ maxWidth: 640, ...style }}>
      <p className="eyebrow">{label}</p>
      <h3>{pitch.title}</h3>
      {pitch.body && <p>{pitch.body}</p>}
      <p className="small muted">{PRO_LINE}{!signedIn && ` ${BETA_LINE}`}</p>
      {signedIn ? <Link className="btn" href="/pricing/">See plans</Link> : <Link className="btn" href={loginHref()}>Sign in free</Link>}
      {section !== "Lab" && <p className="small muted pro-banner-foot">{FREE_LINE}</p>}
    </div>
  );
}

/** `pro`: guests and accounts without Pro see the Pro banner; otherwise guests go to sign-in and come straight back. */
export function RequireSignIn({ children, pro = false }: { children: React.ReactNode; pro?: boolean }) {
  const { user, plan } = usePlan();
  useEffect(() => { if (user === null && !pro) window.location.replace(loginHref()); }, [user, pro]);
  if (plan === undefined) return <div className="skeleton card" style={{ minHeight: 280 }} aria-busy="true" />;
  if (pro && plan !== "pro") return <ProBanner section="Lab" label="MatchSynth Lab" signedIn={!!user} />;
  if (user === null) return <div className="skeleton card" style={{ minHeight: 280 }} aria-busy="true" />;
  return <>{children}</>;
}
