"use client";
// The website's checkout (/checkout/?plan=monthly|yearly): our page around Razorpay's payment window. An order summary
// (plan, free day, first charge, account), then "Continue to secure payment" opens Razorpay; afterwards a confirmation.
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { loginHref } from "@/components/Gate";
import { BillingSwitch, proLine } from "@/components/ProOffer";
import { firstChargeDate, useCheckout } from "@/lib/billing";
import { AUTOPAY_CHECK, PRO, PRO_HIGHLIGHTS, rupees, yearlyPerMonth, yearlySaving, type Billing } from "@/lib/pro";

const day = (d: Date | null) => (d ? d.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }) : "");
const Tick = () => (
  <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2"
       strokeLinecap="round" strokeLinejoin="round"><path d="M4.5 10.5l3.5 3.5 7.5-8" /></svg>
);
const Lock = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2"
       strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="11" width="14" height="10" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
);

export default function Checkout() {
  const params = useSearchParams();
  const router = useRouter();
  const billing: Billing = params.get("plan") === "yearly" ? "yearly" : "monthly";
  const setBilling = (b: Billing) => router.replace(`/checkout/?plan=${b}`, { scroll: false });
  const c = useCheckout(billing, "web");
  useEffect(() => { if (c.uid === null) window.location.replace(loginHref(`/checkout/?plan=${billing}`)); }, [c.uid, billing]);
  const price = billing === "monthly" ? PRO.monthly : PRO.yearly;
  const trial = c.trial;
  const per = billing === "monthly" ? "month" : "year";

  if (c.uid === undefined || c.uid === null || c.b === undefined) {
    return <div className="page-head"><div className="skeleton card" style={{ minHeight: 320 }} aria-busy="true" /></div>;
  }

  if (c.done || c.paid) {
    return (
      <div className="co-page">
        <div className="co-done">
          <span className="co-done-icon"><Tick /></span>
          <p className="cs-eyebrow">CricSynthesis Pro</p>
          <h1>{c.done ? "You're in." : "You already have Pro."}</h1>
          <p>{c.b ? proLine(c.b) : "Every tab of every match and MatchSynth Lab are open on your account."}</p>
          <p className="co-muted">Pro works on the website and in the app with the same account. Razorpay emails you a receipt.</p>
          <div className="co-actions">
            <Link className="cs-btn cs-btn--primary" href="/matches/">Open a match</Link>
            <Link className="cs-btn cs-btn--secondary" href="/account/#subscription">Manage your plan</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="co-page">
      <div className="co-head">
        <p className="cs-eyebrow">Checkout</p>
        <h1>Start CricSynthesis Pro</h1>
      </div>
      <div className="co-grid">
        <section className="co-card" aria-label="Your order">
          <h2>Your plan</h2>
          <BillingSwitch value={billing} onChange={setBilling} />
          <div className="co-line co-plan">
            <div><b>{PRO.name}</b><small>{billing === "yearly" ? `Yearly · ${rupees(yearlyPerMonth)} a month, save ${rupees(yearlySaving)}` : "Monthly · cancel any time"}</small></div>
            <span>{rupees(price)}<small>/{per}</small></span>
          </div>
          {trial ? (
            <>
              <div className="co-line"><span>Due today</span><b>{rupees(0)}</b></div>
              <div className="co-line"><span>Autopay check (refunded)</span><b>{rupees(AUTOPAY_CHECK)}</b></div>
              <div className="co-line"><span>From {day(firstChargeDate())}</span><b>{rupees(price)} a {per}</b></div>
              <p className="co-note">Your free day starts now. To set up autopay, Razorpay takes {rupees(AUTOPAY_CHECK)} to check your card or UPI ID and refunds it straight away. Cancel before {day(firstChargeDate())} and you won&apos;t be charged.</p>
            </>
          ) : (
            <>
              <div className="co-line"><span>Due today</span><b>{rupees(price)}</b></div>
              <div className="co-line"><span>Then</span><b>{rupees(price)} every {per}, until you cancel</b></div>
              <p className="co-note">You&apos;ve already had your free day, so your plan starts today.</p>
            </>
          )}
          <div className="co-line co-account"><span>Account</span><b>{c.email}</b></div>
          <button type="button" className="cs-btn cs-btn--primary co-pay" onClick={c.pay} disabled={c.busy}>
            <Lock />{c.busy ? "Opening secure payment…" : trial ? "Start your free day" : `Pay ${rupees(price)}`}
          </button>
          {c.err && <p className="pro-err" role="alert">{c.err}</p>}
          <p className="co-secure">Secure payment by Razorpay · UPI, cards and netbanking · We never see your card or UPI details.</p>
          <p className="co-legal">By continuing you agree to the <Link href="/terms/#pro">Terms</Link>, <Link href="/privacy/">Privacy policy</Link> and
            {" "}<Link href="/refunds/">Refund and cancellation policy</Link>.
            Your plan renews automatically until you cancel from your account. For ages 18 and over.</p>
        </section>
        <aside className="co-side">
          <h2>What you get</h2>
          <ul className="pro-list">{PRO_HIGHLIGHTS.map((l) => <li key={l}><Tick />{l}</li>)}</ul>
          <p className="co-muted">One plan for the website and the app. <Link href="/pro/">See everything in Pro</Link></p>
        </aside>
      </div>
    </div>
  );
}
