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

export function RequireSignIn({ children, pro = false }: { children: React.ReactNode; pro?: boolean }) {
  const { user, plan } = usePlan();
  useEffect(() => { if (user === null) window.location.replace(loginHref()); }, [user]);
  if (plan === undefined || user === null) return <div className="skeleton card" style={{ minHeight: 280 }} aria-busy="true" />;
  if (pro && plan !== "pro") {
    return (
      <div className="card" style={{ maxWidth: 640 }}>
        <h3>MatchSynth Lab is part of Pro <span className="tag pro">Pro</span></h3>
        <p className="small muted">Pro adds the full what-if engine: pitch and conditions, dew, player form, bowler
          availability and any match situation, re-simulated in your browser.</p>
        <Link className="btn" href="/pricing/">See plans</Link>
      </div>
    );
  }
  return <>{children}</>;
}
