"use client";
// The contact form: posts to the API Worker (POST /contact, edge/src/contact.ts), which stores the message for the
// admin console's Messages page and emails the sender a "thanks, we'll get back to you soon". The hidden "website"
// field and the time on the page keep bots out.
import { useEffect, useRef, useState } from "react";
import { track } from "@/lib/analytics";
import { API } from "@/lib/apiref";
import { auth } from "@/lib/firebase";

export const TOPICS = ["General question", "API and Business plans", "CricSynthesis Pro", "Partnerships", "Press", "Something else"];

export default function ContactForm() {
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const opened = useRef(0);
  useEffect(() => { opened.current = Date.now(); }, []);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.currentTarget).entries()) as Record<string, string>;
    if (!d.name?.trim()) return setErr("Please add your name.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.email?.trim() ?? "")) return setErr("Please add a valid email address.");
    if ((d.message?.trim().length ?? 0) < 10) return setErr("Please write a little more in your message.");
    setBusy(true); setErr(null);
    try {
      let token = "";
      try { token = (await auth().currentUser?.getIdToken()) || ""; } catch { /* not signed in */ }
      const r = await fetch(`${API}/contact`, { method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ ...d, elapsed: Date.now() - opened.current }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.detail || "Couldn't send your message. Try again, or email hello@cricsynthesis.in.");
      track("contact_sent", { topic: d.topic || "General question" });
      setSent(true);
    } catch (x) {
      setErr((x as Error).message || "Couldn't send your message. Try again, or email hello@cricsynthesis.in.");
    } finally { setBusy(false); }
  };

  return (
    <section className="cs-section cs-contact cs-ruled" id="message" style={{ scrollMarginTop: 88 }}>
      <div>
        <h2 className="cs-h2">Send us a message</h2>
        <p className="cs-lede">Questions about forecasts, CricSynthesis Pro, the API or a partnership. We reply to every message,
          usually within one working day.</p>
        <ul className="cs-contact-direct">
          <li><span>General</span><a href="mailto:hello@cricsynthesis.in">hello@cricsynthesis.in</a></li>
          <li><span>Privacy</span><a href="mailto:privacy@cricsynthesis.in">privacy@cricsynthesis.in</a></li>
          <li><span>Legal</span><a href="mailto:legal@cricsynthesis.in">legal@cricsynthesis.in</a></li>
        </ul>
      </div>
      <div className="cs-frame cs-form-card">
        <i className="tl" /><i className="tr" /><i className="bl" /><i className="br" />
        {sent ? (
          <div className="register-success active" role="status">
            <h3>Thanks for getting in touch</h3>
            <p>Your message is with our team and we'll get back to you soon. We've sent a copy to your email.</p>
          </div>
        ) : (
          <form id="contactForm" onSubmit={submit} noValidate>
            <div className="form-group">
              <label htmlFor="cf-name" className="form-label">Name</label>
              <input id="cf-name" name="name" className="form-input" autoComplete="name" maxLength={80} required />
            </div>
            <div className="form-group">
              <label htmlFor="cf-email" className="form-label">Email</label>
              <input id="cf-email" name="email" type="email" className="form-input" autoComplete="email" maxLength={254} required />
            </div>
            <div className="form-group">
              <label htmlFor="cf-topic" className="form-label">Topic</label>
              <select id="cf-topic" name="topic" className="form-input" defaultValue={TOPICS[0]}>
                {TOPICS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="cf-company" className="form-label">Company <span style={{ textTransform: "none", fontWeight: 400 }}>(optional)</span></label>
              <input id="cf-company" name="company" className="form-input" autoComplete="organization" maxLength={100} />
            </div>
            <div className="form-group form-group--wide">
              <label htmlFor="cf-message" className="form-label">Message</label>
              <textarea id="cf-message" name="message" className="form-input" rows={6} maxLength={4000} required />
            </div>
            <div className="hp" aria-hidden="true">
              <label htmlFor="cf-website">Website</label>
              <input id="cf-website" name="website" tabIndex={-1} autoComplete="off" />
            </div>
            {err && <p className="form-error" role="alert">{err}</p>}
            <div className="cs-form-foot">
              <p className="form-disclaimer">We use your details only to reply, as described in our <a href="/privacy/">privacy policy</a>.</p>
              <button type="submit" className="cs-btn cs-btn--primary form-submit" disabled={busy}>{busy ? "Sending…" : "Send message"}</button>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}
