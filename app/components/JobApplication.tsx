"use client";
// Job application form. Posts to the sign-ups Apps Script (type "application"), which saves the resume to Drive,
// adds a row to the Applications sheet and emails the applicant a confirmation.
import Link from "next/link";
import { useState } from "react";
import { SHEET } from "@/components/RequestAccess";
import { jobPath, type Job } from "@/lib/jobs";

const MAX_MB = 5;
const TYPES = ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
const TOOLS = ["Figma", "Illustrator", "Affinity Designer", "Photoshop", "After Effects", "Premiere Pro", "DaVinci Resolve", "CapCut",
  "Lottie / Rive", "Claude Design"];

// Indian mobile number: keep the last 10 digits after dropping a pasted +91 / 91 / 0 prefix, shown as "98765 43210".
export const phoneDigits = (v: string) => {
  let d = v.replace(/\D/g, "");
  if (d.length > 10 && d.startsWith("91")) d = d.slice(2);
  if (d.length > 10 && d.startsWith("0")) d = d.slice(1);
  d = d.replace(/^0+/, "");
  return d.slice(0, 10);
};
export const formatPhone = (d: string) => (d.length > 5 ? `${d.slice(0, 5)} ${d.slice(5)}` : d);

// Links typed without a scheme ("behance.net/name", "www.site.in") get https:// added.
export const toUrl = (v: string) => {
  const s = v.trim().replace(/\s+/g, "");
  if (!s) return "";
  return /^https?:\/\//i.test(s) ? s : `https://${s.replace(/^\/+/, "")}`;
};
export const isUrl = (v: string) => /^https?:\/\/[^\s/.]+\.[^\s]+$/i.test(v);

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
  const [phone, setPhone] = useState("");

  const tidyUrl = (e: React.FocusEvent<HTMLInputElement>) => { e.currentTarget.value = toUrl(e.currentTarget.value); };

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget, fd = new FormData(form);
    const v = (k: string) => String(fd.get(k) ?? "").trim();
    const focus = (k: string) => form.querySelector<HTMLElement>(`[name="${k}"]`)?.focus();
    const file = fd.get("resume") as File | null;
    const portfolio = toUrl(v("portfolio")), linkedin = toUrl(v("linkedin"));
    const missing = ["name", "email", "phone", "city", "experience", "notice", "qualification", "portfolio"].filter((k) => !v(k));
    if (missing.length) { setErr("Please complete all required fields."); focus(missing[0]); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v("email"))) { setErr("Please enter a valid email address."); focus("email"); return; }
    if (!/^[6-9]\d{9}$/.test(phoneDigits(phone))) { setErr("Please enter a valid 10-digit mobile number."); focus("phone"); return; }
    if (!isUrl(portfolio)) { setErr("Please enter a valid portfolio link, for example behance.net/yourname."); focus("portfolio"); return; }
    if (linkedin && !isUrl(linkedin)) { setErr("Please enter a valid LinkedIn link, or leave it blank."); focus("linkedin"); return; }
    if (!file || !file.size) { setErr("Please attach your resume."); focus("resume"); return; }
    if (!TYPES.includes(file.type)) { setErr("Your resume must be a PDF or Word document."); focus("resume"); return; }
    if (file.size > MAX_MB * 1024 * 1024) { setErr(`Your resume must be under ${MAX_MB} MB.`); focus("resume"); return; }
    if (!fd.get("consent")) { setErr("Please confirm that we may store your application."); focus("consent"); return; }
    setErr(null); setState("sending");
    const body = {
      type: "application", job: job.slug, jobTitle: job.title, source: window.location.href,
      name: v("name"), email: v("email"), phone: `+91 ${formatPhone(phoneDigits(phone))}`, city: v("city"), gender: v("gender"),
      experience: v("experience"), employer: v("employer"), designation: v("designation"), notice: v("notice"),
      qualification: v("qualification"), portfolio, linkedin, tools: fd.getAll("tools").join(", "),
      heard: v("heard"), notes: v("notes"), website: v("website"),
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
      <p className="apply-meta">{job.team} · {job.type} · {job.location} · {job.experience}</p>
      <p className="apply-required">Fields marked * are required.</p>

      <fieldset>
        <legend>Personal details</legend>
        <div className="apply-grid">
          <label className="f"><span>Full name *</span><input name="name" id="ap-name" autoComplete="name" required /></label>
          <label className="f"><span>Email *</span><input name="email" id="ap-email" type="email" autoComplete="email" required /></label>
          <label className="f"><span>Mobile number *</span>
            <span className="apply-phone"><span className="apply-phone-cc" aria-hidden="true">+91</span>
              <input name="phone" id="ap-phone" type="tel" inputMode="numeric" autoComplete="tel-national" placeholder="98765 43210"
                aria-label="Mobile number, without +91" value={formatPhone(phone)} onChange={(e) => setPhone(phoneDigits(e.target.value))} required />
            </span></label>
          <label className="f"><span>Current city *</span><input name="city" id="ap-city" autoComplete="address-level2" required /></label>
          <label className="f"><span>Gender <em>optional</em></span>
            <select name="gender" id="ap-gender" defaultValue="">
              <option value="">Select</option>
              <option>Female</option><option>Male</option><option>Non-binary</option><option>Prefer not to say</option>
            </select></label>
        </div>
      </fieldset>

      <fieldset>
        <legend>Professional details</legend>
        <div className="apply-grid">
          <label className="f"><span>Total experience *</span>
            <select name="experience" id="ap-experience" defaultValue="" required>
              <option value="" disabled>Select</option>
              <option>Less than 1 year</option><option>1–2 years</option><option>2–4 years</option><option>4–7 years</option><option>More than 7 years</option>
            </select></label>
          <label className="f"><span>Notice period *</span>
            <select name="notice" id="ap-notice" defaultValue="" required>
              <option value="" disabled>Select</option>
              <option>Immediate</option><option>15 days</option><option>30 days</option><option>60 days</option><option>90 days</option>
            </select></label>
          <label className="f"><span>Current or last employer</span><input name="employer" id="ap-employer" autoComplete="organization" /></label>
          <label className="f"><span>Current designation</span><input name="designation" id="ap-designation" autoComplete="organization-title" /></label>
          <label className="f"><span>Highest qualification *</span>
            <select name="qualification" id="ap-qualification" defaultValue="" required>
              <option value="" disabled>Select</option>
              <option>Class 12</option><option>Diploma</option><option>Bachelor&apos;s degree</option><option>Master&apos;s degree</option><option>Other</option>
            </select></label>
          <label className="f"><span>Portfolio link *</span>
            <input name="portfolio" id="ap-portfolio" inputMode="url" autoComplete="url" placeholder="behance.net/yourname" onBlur={tidyUrl} required />
            <small className="apply-hint">Behance, Dribbble, Instagram, Google Drive or your own website, publicly viewable.</small></label>
          <label className="f"><span>LinkedIn profile</span>
            <input name="linkedin" id="ap-linkedin" inputMode="url" placeholder="linkedin.com/in/yourname" onBlur={tidyUrl} /></label>
        </div>
        <div className="f">
          <span>Tools you use regularly</span>
          <div className="apply-checks">
            {TOOLS.map((t) => <label key={t}><input type="checkbox" name="tools" value={t} id={`ap-tool-${t.replace(/\W+/g, "")}`} /> {t}</label>)}
          </div>
        </div>
      </fieldset>

      <fieldset>
        <legend>Resume</legend>
        <label className="f"><span>Resume or CV * <em>PDF or Word, up to {MAX_MB} MB</em></span>
          <input name="resume" id="ap-resume" type="file" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" required /></label>
        <label className="f"><span>How did you hear about this role?</span>
          <select name="heard" id="ap-heard" defaultValue="">
            <option value="">Select</option>
            <option>LinkedIn</option><option>Instagram</option><option>Job portal</option><option>Referral</option><option>CricSynthesis website</option><option>Other</option>
          </select></label>
        <label className="f"><span>Cover note <em>optional</em></span>
          <textarea name="notes" id="ap-notes" rows={3} /></label>
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
