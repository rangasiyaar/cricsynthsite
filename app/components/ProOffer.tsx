"use client";
// The CricSynthesis Pro offer on the website: plan switch, Free v Pro, everything in Pro, how the free day works, FAQ.
// Copy and prices in lib/pro.ts; checkout in lib/billing.ts (Razorpay's window, then the API verifies the payment).
import Link from "next/link";
import { useState } from "react";
import { loginHref } from "@/components/Gate";
import { ApiPlans } from "@/components/Plans";
import { track } from "@/lib/analytics";
import { hasPaidPro, trialAvailable, useProBilling, type ProBilling } from "@/lib/billing";
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

const day = (d: Date | null) => (d ? d.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }) : "");

/** One line on the account's Pro: free day, renewal, or end date. */
export function proLine(b: ProBilling): string {
  if (b.status === "trial") return `Your free day ends on ${day(b.trialEnd)}. ${b.billing === "yearly" ? "The yearly" : "The monthly"} plan starts then.`;
  if (b.cancelAtEnd || b.status === "cancelled") return `Pro stays on until ${day(b.status === "cancelled" ? b.proUntil : b.currentEnd)}. It won't renew.`;
  if (b.status === "past_due") return "We couldn't take your last payment. Razorpay will retry; you keep Pro for now.";
  if (b.status === "active") return `Renews on ${day(b.currentEnd)}.`;
  return "";
}

export default function ProOffer({ api = false }: { api?: boolean }) {
  const [billing, setBilling] = useState<Billing>("monthly");
  const { user, source } = usePlan();
  const b = useProBilling(user === undefined ? undefined : user?.uid ?? null);
  const paid = hasPaidPro(b);
  const trial = trialAvailable(b);        // one free day per account, checked again by the API
  const price = billing === "monthly" ? PRO.monthly : PRO.yearly;
  const checkoutUrl = `/checkout/?plan=${billing}`;
  const subscribe = () => {
    track("pro_cta", { billing, trial });
    window.location.assign(user === null ? loginHref(checkoutUrl) : checkoutUrl);
  };
  const cta = (cls: string) => paid
    ? <Link className={cls} href="/account/#subscription">Manage your plan</Link>
    : <button type="button" className={cls} onClick={subscribe} disabled={user === undefined}>{ctaLabel(trial)}</button>;

  return (
    <div className="pro-page">
      <section className="pro-hero">
        <p className="cs-eyebrow">{PRO_HERO.eyebrow}</p>
        <h1>{PRO_HERO.title}</h1>
        <p className="pro-sub">{PRO_HERO.sub}</p>
        {paid && <p className="pro-status">You have CricSynthesis Pro. {proLine(b!)}</p>}
        {!paid && source === "comp" && <p className="pro-status">CricSynthesis Pro is on for your account.</p>}
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
          {cta("cs-btn cs-btn--primary pro-cta")}
          <p className="pro-after">{paid ? proLine(b!) : trial ? afterTrial(billing) : `${rupees(price)} a ${billing === "monthly" ? "month" : "year"}. Cancel any time.`}</p>
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

      {api && (
        <section className="pro-section" id="api">
          <h2>For developers and businesses</h2>
          <p className="pro-lede">One API and MCP server for cricket analytics, forecasts and graphics. API Plus includes CricSynthesis Pro.</p>
          <ApiPlans cta={{ free: ["/account/#api-keys", "Get a free key"], pro: ["/account/#subscription", "Get API Plus"], business: ["/contact/", "Contact sales"] }} />
          <p className="pro-fine" style={{ textAlign: "left", margin: "16px 0 0" }}><Link href="/developers/">About the API</Link> · <Link href="/docs/api/">API reference</Link></p>
        </section>
      )}

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
        {cta("cs-btn cs-btn--light")}
        {!paid && <p>{trial ? afterTrial(billing) : "Cancel any time."}</p>}
      </section>

      <p className="pro-fine">{PRO_FINE_PRINT} Secure checkout: UPI, cards and netbanking.</p>
    </div>
  );
}
