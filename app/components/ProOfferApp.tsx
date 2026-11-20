"use client";
// The app's CricSynthesis Pro screen: the same offer as the website's /pro/ page (components/ProOffer.tsx), laid out for
// the phone. One offer everywhere: every locked match-centre tab, MatchSynth Lab and /m/pro/ show this same screen.
// Copy in lib/pro.ts; checkout is Razorpay's window, the same as the website (lib/billing.ts).
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Icon } from "@/components/App";
import { proLine } from "@/components/ProOffer";
import { track } from "@/lib/analytics";
import { hasPaidPro, trialAvailable, useProBilling } from "@/lib/billing";
import { usePlan } from "@/lib/firebase";
import {
  FREE_HIGHLIGHTS, PRO, PRO_FAQ, PRO_FINE_PRINT, PRO_GROUPS, PRO_HERO, PRO_HIGHLIGHTS, TRIAL_STEPS,
  afterTrial, ctaLabel, rupees, yearlyPerMonth, yearlySaving, type Billing,
} from "@/lib/pro";

const Tick = () => (
  <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2"
       strokeLinecap="round" strokeLinejoin="round"><path d="M4.5 10.5l3.5 3.5 7.5-8" /></svg>
);

export default function ProOfferApp({ section = "Lab" }: { section?: string }) {
  const router = useRouter();
  const [billing, setBilling] = useState<Billing>("monthly");
  const { user, source } = usePlan();
  const b = useProBilling(user === undefined ? undefined : user?.uid ?? null);
  const paid = hasPaidPro(b);
  const trial = trialAvailable(b);
  const price = billing === "monthly" ? PRO.monthly : PRO.yearly;
  const subscribe = () => {
    const to = `/m/checkout/?plan=${billing}`;
    track("pro_cta", { billing, trial, where: "app", section });
    router.push(user === null ? `/m/login/?next=${encodeURIComponent(to)}` : to);
  };
  const cta = (cls = "a-btn") => paid
    ? <Link className={cls} href="/m/account/">Manage your plan</Link>
    : <button type="button" className={cls} onClick={subscribe} disabled={user === undefined}>
        {user === null ? "Sign in to start" : ctaLabel(trial)}</button>;
  const after = paid ? proLine(b!) : trial ? afterTrial(billing) : `${rupees(price)} a ${billing === "monthly" ? "month" : "year"}. Cancel any time.`;
  return (
    <div className="ap">
      <div className="ap-hero">
        <span className="a-paywall-icon">{Icon.lab}</span>
        <div className="a-eyebrow" style={{ justifyContent: "center" }}>{PRO_HERO.eyebrow}</div>
        <h1>{PRO_HERO.title}</h1>
        <p>{PRO_HERO.sub}</p>
        {paid && <p className="ap-status">You have CricSynthesis Pro. {proLine(b!)}</p>}
        {!paid && source === "comp" && <p className="ap-status">CricSynthesis Pro is on for your account.</p>}
      </div>

      <div className="ap-switch" role="radiogroup" aria-label="Billing">
        {(["monthly", "yearly"] as Billing[]).map((x) => (
          <button key={x} type="button" role="radio" aria-checked={billing === x} onClick={() => setBilling(x)}>
            {x === "monthly" ? "Monthly" : <>Yearly <span className="ap-save">Save 10%</span></>}
          </button>
        ))}
      </div>

      <div className="ap-card ap-plan is-pro">
        <span className="ap-badge">1 day free</span>
        <h2>{PRO.name}</h2>
        <div className="ap-price">{rupees(price)}<small>/{billing === "monthly" ? "month" : "year"}</small></div>
        <p className="ap-note">{billing === "yearly" ? <>Just {rupees(yearlyPerMonth)} a month. You save {rupees(yearlySaving)}.</>
          : <>Switch to yearly and save {rupees(yearlySaving)}.</>}</p>
        <ul className="ap-list">{PRO_HIGHLIGHTS.map((l) => <li key={l}><Tick />{l}</li>)}</ul>
        <div className="ap-cta">{cta()}</div>
        <p className="ap-after">{after}</p>
      </div>

      <div className="ap-card ap-plan">
        <h2>Free</h2>
        <div className="ap-price">{rupees(0)}</div>
        <p className="ap-note">No account needed</p>
        <ul className="ap-list">{FREE_HIGHLIGHTS.map((l) => <li key={l}><Tick />{l}</li>)}</ul>
      </div>

      <div className="a-group-label" style={{ marginTop: 28 }}>Everything in Pro</div>
      {PRO_GROUPS.map((g) => (
        <div key={g.title} className="ap-card ap-group">
          <h2>{g.title}</h2>
          <ul className="ap-list">{g.items.map((i) => <li key={i}><Tick />{i}</li>)}</ul>
        </div>
      ))}

      <div className="a-group-label" style={{ marginTop: 28 }}>How your free day works</div>
      <ol className="ap-steps ap-card">
        {TRIAL_STEPS.map((st, i) => <li key={st.when}><span>{i + 1}</span><div><b>{st.when}</b><p>{st.text}</p></div></li>)}
      </ol>

      <div className="a-group-label" style={{ marginTop: 28 }}>Questions</div>
      <div className="ap-card ap-faq">
        {PRO_FAQ.map((f) => <details key={f.q}><summary>{f.q}</summary><p>{f.a}</p></details>)}
      </div>

      <div className="ap-final">
        <h2>Ready for the full picture?</h2>
        {cta()}
        {!paid && <p className="ap-after">{trial ? afterTrial(billing) : "Cancel any time."}</p>}
      </div>

      <p className="ap-fine">{PRO_FINE_PRINT} Secure checkout: UPI, cards and netbanking.</p>
      <button type="button" className="a-btn plain" onClick={() => (window.history.length > 2 ? router.back() : router.replace("/m/matches/"))}>Not now</button>
    </div>
  );
}
