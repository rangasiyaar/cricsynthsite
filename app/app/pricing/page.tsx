"use client";
import Link from "next/link";
import { loginHref } from "@/components/Gate";
import { usePlan } from "@/lib/firebase";

const TIERS = [
  { id: "free", name: "Free", price: "₹0", note: "No account needed",
    lines: ["Forecasts for every covered match", "Win chances, projected scores and wicket timing", "Player outlooks and key match-ups",
            "The live simulation engine"] },
  { id: "pro", name: "Pro", price: "₹0", note: "Free during the beta", tag: "Beta",
    lines: ["Everything in Free", "MatchSynth Lab: pitch, conditions, dew and toss", "Player form and bowler availability",
            "Win probability from any match situation"] },
  { id: "api", name: "API", price: "From ₹0", note: "For businesses",
    lines: ["56 endpoints: analytics, simulation and graphics", "Free, Pro and Business limits", "Docs, playground and MCP server"] },
];

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
      <p className="cs-lede">Forecasts are free for everyone. Sign in to get Pro and open MatchSynth Lab at no cost while we're in beta.</p>
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
