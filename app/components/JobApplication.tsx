"use client";
// Job application form. Posts to the sign-ups Apps Script (type "application"), which saves the resume to Drive,
// adds a row to the Applications sheet and emails the applicant a confirmation.
import Link from "next/link";
import { useState } from "react";
import { SHEET } from "@/components/RequestAccess";
import { jobPath, type Job } from "@/lib/jobs";

const MAX_MB = 5;
const TYPES = ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
const TOOLS = ["Figma", "Illustrator", "Affinity Designer", "Photoshop", "After Effects", "Premiere Pro", "DaVinci Resolve", "CapCut", "Lottie / Rive"];

const toBase64 = (f: File) => new Promise<string>((ok, fail) => {
  const r = new FileReader();
  r.onload = () => ok(String(r.result).split(",")[1] ?? "");
  r.onerror = () => fail(r.error);
  r.readAsDataURL(f);
});

type State = "idle" | "sending" | "sent" | "unconfirmed";

export default function JobApplication({ job }: { job: Job }) {
  const [state, setState] = useState<State>("idle");
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget, fd = new FormData(form);
    const v = (k: string) => String(fd.get(k) ?? "").trim();
    const file = fd.get("resume") as File | null;
    const missing = ["name", "email", "phone", "city", "portfolio", "status", "experience", "notice", "reels", "graphic", "cricket"].filter((k) => !v(k));
    if (missing.length) { setErr("Please complete all required fields."); form.querySelector<HTMLElement>(`[name="${missing[0]}"]`)?.focus(); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v("email"))) { setErr("Please enter a valid email address."); return; }
    if (!/^\+?[0-9 ()-]{8,20}$/.test(v("phone"))) { setErr("Please enter a valid phone number, with country code."); return; }
    if (!/^https?:\/\/\S+\.\S+/.test(v("portfolio"))) { setErr("Please enter your portfolio as a full link, starting with https://"); return; }
    if (!file || !file.size) { setErr("Please attach your resume."); return; }
    if (!TYPES.includes(file.type)) { setErr("Your resume must be a PDF or Word document."); return; }
    if (file.size > MAX_MB * 1024 * 1024) { setErr(`Your resume must be under ${MAX_MB} MB.`); return; }
    if (!fd.get("consent")) { setErr("Please confirm that we may store your application."); return; }
    setErr(null); setState("sending");
    const body = {
      type: "application", job: job.slug, jobTitle: job.title, source: window.location.href,
      name: v("name"), email: v("email"), phone: v("phone"), city: v("city"), linkedin: v("linkedin"), portfolio: v("portfolio"),
      status: v("status"), experience: v("experience"), notice: v("notice"), tools: fd.getAll("tools").join(", "),
      reels: v("reels"), graphic: v("graphic"), cricket: v("cricket"), notes: v("notes"), website: v("website"),
      resume: { name: file.name, type: file.type, data: await toBase64(file) },
    };
    try {
      const res = await fetch(SHEET, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(body) });
      const out = await res.json().catch(() => null);
      if (out && out.success === false) { setState("idle"); setErr(out.error === "resume" ? "We could not read your resume. Please try another file." : "Something went wrong. Please check your details and try again."); return; }
      setState("sent");
    } catch {
      setState("unconfirmed");                                   // sent, but the browser could not read the reply
    }
    window.scrollTo({ top: 0 });
  };

  if (state === "sent" || state === "unconfirmed") return (
    <div className="apply-done" role="status">
      <h2>Application received</h2>
      {state === "sent"
        ? <p>Thank you for applying for {job.title}. We have sent a confirmation to your email. We review every application and will
            contact you if you are shortlisted.</p>
        : <p>Thank you for applying for {job.title}. If you do not receive a confirmation email within 15 minutes, please send your
            resume to <a href="mailto:hello@cricsynthesis.in">hello@cricsynthesis.in</a>.</p>}
      <p><Link href="/careers/">Back to careers</Link></p>
    </div>
  );

  return (
    <form className="apply-form" onSubmit={submit} noValidate>
      <p className="job-back"><Link href={jobPath(job.slug)}>← Back to the job description</Link></p>
      <h2 className="job-title">{job.title}</h2>
      <p className="apply-meta">{job.team} · {job.type} · {job.location}</p>
      <p className="apply-required">Fields marked * are required.</p>

      <fieldset>
        <legend>Personal details</legend>
        <div className="apply-grid">
          <label className="f"><span>Full name *</span><input name="name" id="ap-name" autoComplete="name" required /></label>
          <label className="f"><span>Email *</span><input name="email" id="ap-email" type="email" autoComplete="email" required /></label>
          <label className="f"><span>Phone *</span><input name="phone" id="ap-phone" type="tel" autoComplete="tel" placeholder="+91 98765 43210" required /></label>
          <label className="f"><span>City *</span><input name="city" id="ap-city" autoComplete="address-level2" required /></label>
          <label className="f"><span>Portfolio link *</span><input name="portfolio" id="ap-portfolio" type="url" placeholder="https://" required /></label>
          <label className="f"><span>LinkedIn profile</span><input name="linkedin" id="ap-linkedin" type="url" placeholder="https://linkedin.com/in/" /></label>
        </div>
      </fieldset>

      <fieldset>
        <legend>Experience</legend>
        <div className="apply-grid">
          <label className="f"><span>Current status *</span>
            <select name="status" id="ap-status" defaultValue="" required>
              <option value="" disabled>Select</option>
              <option>Employed full-time</option><option>Freelance</option><option>Between roles</option><option>Student / recent graduate</option>
            </select></label>
          <label className="f"><span>Years of professional experience *</span>
            <select name="experience" id="ap-experience" defaultValue="" required>
              <option value="" disabled>Select</option>
              <option>Less than 1 year</option><option>1–2 years</option><option>2–4 years</option><option>4–7 years</option><option>More than 7 years</option>
            </select></label>
          <label className="f"><span>Notice period *</span>
            <select name="notice" id="ap-notice" defaultValue="" required>
              <option value="" disabled>Select</option>
              <option>Available immediately</option><option>15 days</option><option>30 days</option><option>60 days</option><option>90 days</option>
            </select></label>
        </div>
        <div className="f">
          <span>Tools you use regularly</span>
          <div className="apply-checks">
            {TOOLS.map((t) => <label key={t}><input type="checkbox" name="tools" value={t} id={`ap-tool-${t.replace(/\W+/g, "")}`} /> {t}</label>)}
          </div>
        </div>
      </fieldset>

      <fieldset>
        <legend>Questions</legend>
        <label className="f"><span>Share links to two or three short-form videos you edited, and describe your role in each. *</span>
          <textarea name="reels" id="ap-reels" rows={4} required /></label>
        <label className="f"><span>Describe a data graphic you designed: what the data was, who it was for, and one design decision you made. *</span>
          <textarea name="graphic" id="ap-graphic" rows={4} required /></label>
        <label className="f"><span>How do you follow cricket, and which formats do you watch most? *</span>
          <textarea name="cricket" id="ap-cricket" rows={3} required /></label>
        <label className="f"><span>Anything else you would like us to know</span>
          <textarea name="notes" id="ap-notes" rows={3} /></label>
      </fieldset>

      <fieldset>
        <legend>Resume</legend>
        <label className="f"><span>Resume or CV * <em>PDF or Word, up to {MAX_MB} MB</em></span>
          <input name="resume" id="ap-resume" type="file" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" required /></label>
      </fieldset>

      <div className="apply-hp" aria-hidden="true"><label>Website<input name="website" id="ap-website" tabIndex={-1} autoComplete="off" /></label></div>

      <label className="apply-consent"><input type="checkbox" name="consent" id="ap-consent" />
        <span>I agree that CricSynthesis may store and review my application for this and future openings, as described in the <Link href="/privacy/">privacy policy</Link>. *</span></label>

      {err && <p className="apply-error" role="alert">{err}</p>}
      <div className="apply-foot">
        <button type="submit" className="cs-btn cs-btn--primary" disabled={state === "sending"}><span>{state === "sending" ? "Submitting…" : "Submit application"}</span></button>
      </div>
    </form>
  );
}
