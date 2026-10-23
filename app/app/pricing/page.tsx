"use client";
import Link from "next/link";
import { loginHref } from "@/components/Gate";
import { usePlan } from "@/lib/firebase";
import { TIERS } from "@/lib/plans";

export default function Pricing() {
  const { plan, source } = usePlan();
  const cta = (id: string) => {
    if (id === "api") return <Link className="btn ghost" href="/developers/#plans">API plans</Link>;
    if (id === "free") return <Link className="btn ghost" href="/#next">See matches</Link>;
    if (plan === "pro") return <Link className="btn" href="/lab/">Open MatchSynth Lab</Link>;
    return <Link className="btn" href={plan === undefined || plan === "guest" ? loginHref("/lab/") : "/account/"}>Get Pro</Link>;
  };
  return (
    <div className="page-head" style={{ paddingBottom: 80 }}>
      <p className="cs-eyebrow">Plans</p>
      <h1><span>Simple plans.</span><span>Pro is free in the beta.</span></h1>
      {plan === "pro" && <p className="notice" style={{ marginTop: 20 }}>You're on Pro{source === "beta" ? " (free during the beta)" : ""}.</p>}
      <div className="grid g3" style={{ marginTop: 28 }}>
        {TIERS.map((t) => (
          <div key={t.id} className="card">
            <h3>{t.name} {t.tag && <span className="tag pro">{t.tag}</span>}</h3>
            <div className="stat" style={{ fontSize: 34 }}>{t.price}</div>
            <p className="small muted" style={{ marginTop: 0 }}>{t.note}</p>
            <ul className="small" style={{ paddingLeft: 18, color: "var(--ink-2)" }}>{t.lines.map((l) => <li key={l}>{l}</li>)}</ul>
            <div className="card-foot">{cta(t.id)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
