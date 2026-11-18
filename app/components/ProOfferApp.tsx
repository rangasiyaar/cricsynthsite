"use client";
// The app's CricSynthesis Pro screen (locked sections, MatchSynth Lab, /m/pro/): what Pro adds, yearly or monthly, the
// free day, questions. Copy in lib/pro.ts (a locked section leads with its own pitch from lib/procopy.ts). Checkout is
// Razorpay's window, the same as the website (lib/billing.ts); the app is installed outside the Play Store.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Icon } from "@/components/App";
import { TAB_ICONS, sectionName, type Section } from "@/components/MatchCentre";
import { track } from "@/lib/analytics";
import { hasPaidPro, trialAvailable, useProBilling } from "@/lib/billing";
import { usePlan } from "@/lib/firebase";
import { PITCH } from "@/lib/procopy";
import {
  PRO, PRO_FAQ, PRO_FINE_PRINT, PRO_GROUPS, PRO_HERO, PRO_HIGHLIGHTS, TRIAL_STEPS,
  afterTrial, ctaLabel, rupees, yearlyPerMonth, yearlySaving, type Billing,
} from "@/lib/pro";

const Tick = () => (
  <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2"
       strokeLinecap="round" strokeLinejoin="round"><path d="M4.5 10.5l3.5 3.5 7.5-8" /></svg>
);

export default function ProOfferApp({ section = "Lab" }: { section?: string }) {
  const router = useRouter();
  const [billing, setBilling] = useState<Billing>("yearly");
  const { user } = usePlan();
  const b = useProBilling(user === undefined ? undefined : user?.uid ?? null);
  const paid = hasPaidPro(b);
  const trial = trialAvailable(b);
  const here = typeof window === "undefined" ? "/m/pro/" : window.location.pathname + window.location.search;
  const centre = section !== "Lab" && !!PITCH[section];
  const hero = centre ? { eyebrow: sectionName(section), title: PITCH[section].title, sub: `${PITCH[section].body} Part of CricSynthesis Pro, free for your first day.` }
    : section === "Lab" && here.startsWith("/m/lab") ? { eyebrow: "MatchSynth Lab", title: PITCH.Lab.title, sub: `${PITCH.Lab.body} Part of CricSynthesis Pro, free for your first day.` }
    : PRO_HERO;
  const subscribe = () => {
    const to = `/m/checkout/?plan=${billing}`;
    track("pro_cta", { billing, trial, where: "app" });
    router.push(user === null ? `/m/login/?next=${encodeURIComponent(to)}` : to);
  };
  const options: { id: Billing; title: string; price: string; per: string; note: string; badge?: string }[] = [
    { id: "yearly", title: "Yearly", price: rupees(PRO.yearly), per: "/year", note: `${rupees(yearlyPerMonth)} a month`, badge: `Save ${rupees(yearlySaving)}` },
    { id: "monthly", title: "Monthly", price: rupees(PRO.monthly), per: "/month", note: "Flexible, cancel any time" },
  ];
  return (
    <div className="ap">
      <div className="ap-hero">
        <span className="a-paywall-icon">{centre ? TAB_ICONS[section as Section] ?? Icon.lab : Icon.lab}</span>
        <div className="a-eyebrow" style={{ justifyContent: "center" }}>{hero.eyebrow}</div>
        <h1>{hero.title}</h1>
        <p>{hero.sub}</p>
      </div>

      <ul className="ap-list ap-card">{PRO_HIGHLIGHTS.map((l) => <li key={l}><Tick />{l}</li>)}</ul>

      <div className="a-group-label">Choose your plan</div>
      <div className="ap-options" role="radiogroup" aria-label="Plan">
        {options.map((o) => (
          <button key={o.id} type="button" role="radio" aria-checked={billing === o.id} className="ap-option" onClick={() => setBilling(o.id)}>
            <span className="ap-radio" aria-hidden="true" />
            <span className="ap-option-main"><b>{o.title}</b><small>{o.note}</small></span>
            <span className="ap-option-price">{o.price}<small>{o.per}</small></span>
            {o.badge && <span className="ap-badge">{o.badge}</span>}
          </button>
        ))}
      </div>

      <div className="ap-cta">
        {paid ? <Link className="a-btn" href="/m/matches/">You have Pro: open a match</Link>
          : <button type="button" className="a-btn" onClick={subscribe} disabled={user === undefined}>
              {user === null ? "Sign in to start" : ctaLabel(trial)}</button>}
      </div>
      <p className="ap-after">{paid ? "Manage your plan from Account." : trial ? afterTrial(billing) : `${rupees(billing === "monthly" ? PRO.monthly : PRO.yearly)} a ${billing === "monthly" ? "month" : "year"}. Cancel any time.`}</p>

      <div className="a-group-label" style={{ marginTop: 28 }}>How your free day works</div>
      <ol className="ap-steps ap-card">
        {TRIAL_STEPS.map((s, i) => <li key={s.when}><span>{i + 1}</span><div><b>{s.when}</b><p>{s.text}</p></div></li>)}
      </ol>

      <div className="a-group-label" style={{ marginTop: 28 }}>Everything in Pro</div>
      {PRO_GROUPS.map((g) => (
        <div key={g.title} className="ap-card ap-group">
          <h2>{g.title}</h2>
          <ul className="ap-list">{g.items.map((i) => <li key={i}><Tick />{i}</li>)}</ul>
        </div>
      ))}

      <div className="a-group-label" style={{ marginTop: 28 }}>Questions</div>
      <div className="ap-card ap-faq">
        {PRO_FAQ.map((f) => <details key={f.q}><summary>{f.q}</summary><p>{f.a}</p></details>)}
      </div>

      <p className="ap-fine">{PRO_FINE_PRINT}</p>
      <button type="button" className="a-btn plain" onClick={() => (window.history.length > 2 ? router.back() : router.replace("/m/matches/"))}>Not now</button>

    </div>
  );
}
