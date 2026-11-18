"use client";
// The CricSynthesis Pro offer on the website: plan switch, Free v Pro, everything in Pro, how the free day works, FAQ.
// Copy and prices in lib/pro.ts. Checkout isn't connected yet: the buttons open a "coming soon" note.
import { useEffect, useState } from "react";
import { usePlan } from "@/lib/firebase";
import {
  FREE_HIGHLIGHTS, PRO, PRO_FAQ, PRO_FINE_PRINT, PRO_GROUPS, PRO_HERO, PRO_HIGHLIGHTS, TRIAL_STEPS,
  afterTrial, ctaLabel, rupees, yearlyPerMonth, yearlySaving, type Billing,
} from "@/lib/pro";

const Tick = () => (
  <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2"
       strokeLinecap="round" strokeLinejoin="round"><path d="M4.5 10.5l3.5 3.5 7.5-8" /></svg>
);

export function BillingSwitch({ value, onChange }: { value: Billing; onChange: (b: Billing) => void }) {
  return (
    <div className="pro-switch" role="radiogroup" aria-label="Billing">
      {(["monthly", "yearly"] as Billing[]).map((b) => (
        <button key={b} type="button" role="radio" aria-checked={value === b} onClick={() => onChange(b)}>
          {b === "monthly" ? "Monthly" : <>Yearly <span className="pro-save">Save 10%</span></>}
        </button>
      ))}
    </div>
  );
}

function ComingSoon({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onClose]);
  return (
    <div className="pro-modal-wrap" role="dialog" aria-modal="true" aria-labelledby="pro-soon">
      <button type="button" className="pro-modal-scrim" aria-label="Close" onClick={onClose} />
      <div className="pro-modal">
        <h3 id="pro-soon">Checkout is almost ready</h3>
        <p>Payments for CricSynthesis Pro open soon. Nothing has been charged.</p>
        <button type="button" className="cs-btn cs-btn--primary" onClick={onClose}>OK</button>
      </div>
    </div>
  );
}

export default function ProOffer() {
  const [billing, setBilling] = useState<Billing>("yearly");
  const [soon, setSoon] = useState(false);
  const { plan } = usePlan();
  const trial = true;                       // every new account gets one free day (checked server-side once payments are live)
  const price = billing === "monthly" ? PRO.monthly : PRO.yearly;
  const subscribe = () => setSoon(true);

  return (
    <div className="pro-page">
      <section className="pro-hero">
        <p className="cs-eyebrow">{PRO_HERO.eyebrow}</p>
        <h1>{PRO_HERO.title}</h1>
        <p className="pro-sub">{PRO_HERO.sub}</p>
        <BillingSwitch value={billing} onChange={setBilling} />
      </section>

      <section className="pro-plans" aria-label="Plans">
        <div className="pro-plan">
          <h2>Free</h2>
          <div className="pro-price">{rupees(0)}</div>
          <p className="pro-note">No account needed</p>
          <ul className="pro-list">{FREE_HIGHLIGHTS.map((l) => <li key={l}><Tick />{l}</li>)}</ul>
          <a className="cs-btn cs-btn--secondary pro-cta" href="/matches/">See today&apos;s matches</a>
        </div>

        <div className="pro-plan is-pro">
          <div className="pro-ribbon">1 day free</div>
          <h2>{PRO.name}</h2>
          <div className="pro-price">{rupees(price)}<span>/{billing === "monthly" ? "month" : "year"}</span></div>
          <p className="pro-note">{billing === "yearly"
            ? <>Just {rupees(yearlyPerMonth)} a month. You save {rupees(yearlySaving)}.</>
            : <>Switch to yearly and save {rupees(yearlySaving)}.</>}</p>
          <ul className="pro-list">{PRO_HIGHLIGHTS.map((l) => <li key={l}><Tick />{l}</li>)}</ul>
          {plan === "pro"
            ? <a className="cs-btn cs-btn--primary pro-cta" href="/matches/">You have Pro: open a match</a>
            : <button type="button" className="cs-btn cs-btn--primary pro-cta" onClick={subscribe}>{ctaLabel(trial)}</button>}
          <p className="pro-after">{trial ? afterTrial(billing) : "Cancel any time."}</p>
        </div>
      </section>

      <section className="pro-section">
        <h2>Everything in Pro</h2>
        <div className="pro-groups">
          {PRO_GROUPS.map((g) => (
            <div key={g.title} className="pro-group">
              <h3>{g.title}</h3>
              <ul className="pro-list">{g.items.map((i) => <li key={i}><Tick />{i}</li>)}</ul>
            </div>
          ))}
        </div>
      </section>

      <section className="pro-section">
        <h2>How your free day works</h2>
        <ol className="pro-steps">
          {TRIAL_STEPS.map((s, i) => (
            <li key={s.when}><span className="pro-step-n">{i + 1}</span><div><b>{s.when}</b><p>{s.text}</p></div></li>
          ))}
        </ol>
      </section>

      <section className="pro-section">
        <h2>Questions</h2>
        <div className="pro-faq">
          {PRO_FAQ.map((f) => (
            <details key={f.q}><summary>{f.q}</summary><p>{f.a}</p></details>
          ))}
        </div>
      </section>

      <section className="pro-final">
        <h2>Ready for the full picture?</h2>
        <button type="button" className="cs-btn cs-btn--light" onClick={subscribe}>{ctaLabel(trial)}</button>
        <p>{afterTrial(billing)}</p>
      </section>

      <p className="pro-fine">{PRO_FINE_PRINT} Secure checkout: UPI, cards and netbanking.</p>
      {soon && <ComingSoon onClose={() => setSoon(false)} />}
    </div>
  );
}
