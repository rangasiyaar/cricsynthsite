"use client";
// Cookie banner (bottom bar). Accept all / Reject all are equally prominent; "Choose" shows one switch per purpose.
// Shown on the first visit, after 12 months, when the policy version changes, and from the footer's "Cookie settings".
import Link from "next/link";
import { useEffect, useState } from "react";
import { CLARITY_ID, consentApplies, initAnalytics } from "@/lib/analytics";
import { getConsent, setConsent } from "@/lib/consent";

export default function ConsentBanner() {
  const [open, setOpen] = useState(false);
  const [choose, setChoose] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [recordings, setRecordings] = useState(false);

  useEffect(() => {
    if (!consentApplies()) return;
    initAnalytics();
    const c = getConsent();
    if (!c) setOpen(true);
    const reopen = () => {
      const now = getConsent();
      setAnalytics(now?.analytics ?? false);
      setRecordings(now?.recordings ?? false);
      setChoose(true);
      setOpen(true);
    };
    window.addEventListener("cs-consent-open", reopen);
    return () => window.removeEventListener("cs-consent-open", reopen);
  }, []);

  if (!open) return null;
  const save = (a: boolean, r: boolean) => { setConsent(a, r); setOpen(false); setChoose(false); };

  return (
    <section className="cs-consent" role="dialog" aria-modal="false" aria-labelledby="cs-consent-title">
      <div className="cs-consent-in">
        <div className="cs-consent-text">
          <h2 id="cs-consent-title">Cookies</h2>
          <p>We use optional analytics cookies to see which pages and features people use, so we can improve CricSynthesis.
            No advertising, and nothing is set unless you agree. <Link href="/privacy/#cookies">Details</Link></p>
        </div>
        {choose && (
          <div className="cs-consent-opts">
            <label className="cs-consent-opt"><input type="checkbox" checked disabled />
              <span><b>Necessary</b> Sign-in, theme and your choices here. Always on.</span></label>
            <label className="cs-consent-opt"><input type="checkbox" checked={analytics} onChange={(e) => setAnalytics(e.target.checked)} />
              <span><b>Analytics</b> Google Analytics: pages viewed and features used, counted anonymously.</span></label>
            {CLARITY_ID && <label className="cs-consent-opt"><input type="checkbox" checked={recordings} onChange={(e) => setRecordings(e.target.checked)} />
              <span><b>Session recordings</b> Microsoft Clarity: heatmaps and replays of clicks and scrolling, with all typed text hidden.</span></label>}
          </div>
        )}
        <div className="cs-consent-btns">
          {choose
            ? <button type="button" className="cs-btn cs-btn--primary" onClick={() => save(analytics, recordings && Boolean(CLARITY_ID))}>Save choices</button>
            : <button type="button" className="cs-btn cs-btn--secondary" onClick={() => setChoose(true)}>Choose</button>}
          <button type="button" className="cs-btn cs-btn--primary" onClick={() => save(false, false)}>Reject all</button>
          <button type="button" className="cs-btn cs-btn--primary" onClick={() => save(true, Boolean(CLARITY_ID))}>Accept all</button>
        </div>
      </div>
    </section>
  );
}
