"use client";
// "Contact sales" form: same Google Sheet endpoint the original website used (Apps Script web app, free).
import { useState } from "react";

const SHEET = "https://script.google.com/macros/s/AKfycbxLxYswUwhcZThYQLRCnjBcRLw9EIXmjyXJL5Yz6cN6yFesjvvUu2fScPfXgofVLoDi/exec";

export default function RequestAccess({ title = "Start building with CricSynthesis" }: { title?: string }) {
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget).entries()) as Record<string, string>;
    if (!data.name?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email ?? "")) {
      setErr("Please add your name and a valid email.");
      return;
    }
    setBusy(true); setErr(null);
    try {
      await fetch(SHEET, { method: "POST", mode: "no-cors", headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ ...data, source: window.location.href }) });
    } catch { /* no-cors hides the response; the sheet still records it */ }
    setBusy(false); setSent(true);
  };

  return (
    <section id="request-access" className="cs-section cs-contact" style={{ scrollMarginTop: 88 }}>
      <div>
        <p className="cs-eyebrow">Contact sales</p>
        <h2 className="cs-h2">{title}</h2>
        <p className="cs-lede">Fantasy platform, franchise analytics team, broadcaster or media house: tell us what you need and
          we'll set up API access and onboard you directly.</p>
      </div>
      <div className="cs-frame cs-form-card">
        <i className="tl" /><i className="tr" /><i className="bl" /><i className="br" />
        {sent ? (
          <div className="register-success active" role="status">
            <p className="cs-eyebrow">Request received</p>
            <h3>We'll be in touch</h3>
            <p>We'll review your request and reach out with next steps.</p>
          </div>
        ) : (
          <form id="registrationForm" className="register-form" onSubmit={submit} noValidate>
            <div className="form-group">
              <label htmlFor="ra-name" className="form-label">Full name</label>
              <input id="ra-name" name="name" className="form-input" placeholder="Your name" required />
            </div>
            <div className="form-group">
              <label htmlFor="ra-email" className="form-label">Work email</label>
              <input id="ra-email" name="email" type="email" className="form-input" placeholder="name@company.com" required />
            </div>
            <div className="form-group form-group--wide">
              <label htmlFor="ra-org" className="form-label">Organisation</label>
              <input id="ra-org" name="organization" className="form-input" placeholder="Team, network or platform" />
            </div>
            <div className="form-group form-group--wide">
              <label htmlFor="ra-segment" className="form-label">Interested in</label>
              <select id="ra-segment" name="segment" className="form-input" defaultValue="">
                <option value="">Select one</option>
                <option value="analytics">Analytics: ratings, projections, matchups</option>
                <option value="simulation">Simulation: match forecasts and what-ifs</option>
                <option value="graphics">Graphics: share-ready cards</option>
                <option value="all">The full catalog</option>
              </select>
            </div>
            {err && <p className="small" role="alert" style={{ color: "var(--cs-danger, #c0392b)" }}>{err}</p>}
            <div className="cs-form-foot">
              <button type="submit" className="cs-btn cs-btn--primary form-submit" disabled={busy}><span>{busy ? "Sending…" : "Contact sales"}</span></button>
              <p className="form-disclaimer">We never share your details with third parties.</p>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}
