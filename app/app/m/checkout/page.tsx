"use client";
// App checkout (/m/checkout/?plan=monthly|yearly): order summary, then Razorpay's payment window; a confirmation after.
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import { Loading, TopBar } from "@/components/App";
import { proLine } from "@/components/ProOffer";
import { firstChargeDate, useCheckout } from "@/lib/billing";
import { PRO, PRO_HIGHLIGHTS, rupees, yearlyPerMonth, yearlySaving, type Billing } from "@/lib/pro";

const day = (d: Date | null) => (d ? d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "");
const Tick = () => (
  <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2"
       strokeLinecap="round" strokeLinejoin="round"><path d="M4.5 10.5l3.5 3.5 7.5-8" /></svg>
);

function Checkout() {
  const params = useSearchParams();
  const router = useRouter();
  const billing: Billing = params.get("plan") === "monthly" ? "monthly" : "yearly";
  const c = useCheckout(billing, "app");
  useEffect(() => {
    if (c.uid === null) router.replace(`/m/login/?next=${encodeURIComponent(`/m/checkout/?plan=${billing}`)}`);
  }, [c.uid, billing, router]);
  const price = billing === "monthly" ? PRO.monthly : PRO.yearly;
  const per = billing === "monthly" ? "month" : "year";
  if (!c.uid || c.b === undefined) return <Loading rows={3} />;

  if (c.done || c.paid) {
    return (
      <div className="ap">
        <div className="ap-hero">
          <span className="a-paywall-icon"><Tick /></span>
          <div className="a-eyebrow" style={{ justifyContent: "center" }}>CricSynthesis Pro</div>
          <h1>{c.done ? "You're in." : "You already have Pro."}</h1>
          <p>{c.b ? proLine(c.b) : "Every tab of every match and MatchSynth Lab are open."}</p>
          <p>Razorpay emails you a receipt.</p>
        </div>
        <Link href="/m/matches/" className="a-btn">Open a match</Link>
        <Link href="/m/account/" className="a-btn plain">Manage your plan</Link>
      </div>
    );
  }

  return (
    <div className="ap">
      <div className="a-title" style={{ paddingBottom: 12 }}><div className="a-eyebrow">Checkout</div><h1>Start CricSynthesis Pro</h1></div>
      <div className="a-group-label">Your plan</div>
      <div className="ap-options" role="radiogroup" aria-label="Plan">
        {(["yearly", "monthly"] as Billing[]).map((id) => (
          <button key={id} type="button" role="radio" aria-checked={billing === id} className="ap-option"
                  onClick={() => router.replace(`/m/checkout/?plan=${id}`)}>
            <span className="ap-radio" aria-hidden="true" />
            <span className="ap-option-main"><b>{id === "yearly" ? "Yearly" : "Monthly"}</b>
              <small>{id === "yearly" ? `${rupees(yearlyPerMonth)} a month` : "Flexible, cancel any time"}</small></span>
            <span className="ap-option-price">{rupees(id === "yearly" ? PRO.yearly : PRO.monthly)}<small>/{id === "yearly" ? "year" : "month"}</small></span>
            {id === "yearly" && <span className="ap-badge">Save {rupees(yearlySaving)}</span>}
          </button>
        ))}
      </div>
      <div className="ap-card ap-sum" style={{ marginTop: 16 }}>
        {c.trial ? (
          <>
            <div><span>Due today</span><b>{rupees(0)}</b></div>
            <div><span>From {day(firstChargeDate())}</span><b>{rupees(price)} a {per}</b></div>
          </>
        ) : (
          <>
            <div><span>Due today</span><b>{rupees(price)}</b></div>
            <div><span>Renews</span><b>Every {per}</b></div>
          </>
        )}
        <div><span>Account</span><b>{c.email}</b></div>
      </div>
      <p className="ap-after" style={{ margin: "0 4px 14px", textAlign: "left" }}>{c.trial
        ? `Your free day starts now. Cancel before ${day(firstChargeDate())} and you won't be charged.`
        : "You've already had your free day, so your plan starts today."}</p>
      <button type="button" className="a-btn" onClick={c.pay} disabled={c.busy}>
        {c.busy ? "Opening secure payment…" : c.trial ? "Start your free day" : `Pay ${rupees(price)}`}</button>
      {c.err && <div className="a-msg" role="alert" style={{ marginTop: 10 }}>{c.err}</div>}
      <p className="ap-after">Secure payment by Razorpay · UPI, cards and netbanking</p>
      <div className="a-group-label" style={{ marginTop: 26 }}>What you get</div>
      <ul className="ap-list ap-card">{PRO_HIGHLIGHTS.map((l) => <li key={l}><Tick />{l}</li>)}</ul>
      <p className="ap-fine">By continuing you agree to the Terms and Privacy policy. Your plan renews automatically until you cancel from Account. For ages 18 and over.</p>
    </div>
  );
}

export default function CheckoutScreen() {
  return <><TopBar back="/m/pro/" /><Suspense fallback={<Loading rows={3} />}><Checkout /></Suspense></>;
}
