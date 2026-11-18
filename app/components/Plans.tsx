// Plan cards shared by the pricing page and the developers page (plans in lib/plans.ts).
import Link from "next/link";
import { API_TIERS } from "@/lib/plans";

const Tick = () => (
  <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2"
       strokeLinecap="round" strokeLinejoin="round"><path d="M4.5 10.5l3.5 3.5 7.5-8" /></svg>
);

/** API Free / Plus / Business. `cta`: plan id → [href, label]. */
export function ApiPlans({ cta }: { cta: Record<string, [string, string]> }) {
  return (
    <div className="pro-plans pro-plans-3">
      {API_TIERS.map((t) => (
        <div key={t.id} className={`pro-plan${t.id === "pro" ? " is-pro" : ""}`}>
          <h2>{t.name}</h2>
          <div className="pro-price">{t.price}{t.per && <span>{t.per}</span>}</div>
          <p className="pro-note">{t.note}</p>
          <ul className="pro-list">{t.lines.map((l) => <li key={l}><Tick />{l}</li>)}</ul>
          {cta[t.id] && <Link className={`cs-btn ${t.id === "pro" ? "cs-btn--primary" : "cs-btn--secondary"} pro-cta`} href={cta[t.id][0]}>{cta[t.id][1]}</Link>}
        </div>
      ))}
    </div>
  );
}
