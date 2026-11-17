"use client";
// The 18+ check shown over every page right after sign-in (website and app), until the account holder confirms
// their age. Under 18 the sign-in is deleted. See lib/age.ts.
import { useEffect, useState } from "react";
import { ageOn, confirmAdult, declineMinor, isAdult, MIN_AGE, validDob } from "@/lib/age";
import { useUser } from "@/lib/firebase";
import { welcome } from "@/lib/welcome";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export default function AgeGate() {
  const user = useUser();
  const [state, setState] = useState<"idle" | "ask" | "declined">("idle");
  const [d, setD] = useState(""), [m, setM] = useState(""), [y, setY] = useState("");
  const [busy, setBusy] = useState(false), [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!user) { if (state === "ask") setState("idle"); return; }
    let live = true;
    isAdult(user.uid).then((ok) => {
      if (!live) return;
      if (ok) { welcome(user); setState("idle"); } else setState("ask");
    }).catch(() => live && setState("ask"));
    return () => { live = false; };
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  if (state === "declined") {
    return (
      <div className="age-gate" role="dialog" aria-modal="true" aria-labelledby="age-title">
        <div className="age-card">
          <h2 id="age-title">Accounts are for ages {MIN_AGE}+</h2>
          <p>Sorry, you need to be {MIN_AGE} or older to have a CricSynthesis account. We&apos;ve removed the sign-in and kept no details about you.</p>
          <p className="small muted">You can still read the public match pages without an account.</p>
          <button type="button" className="cs-btn cs-btn--primary" onClick={() => { setState("idle"); window.location.assign(window.location.pathname.startsWith("/m/") ? "/m/" : "/"); }}>OK</button>
        </div>
      </div>
    );
  }
  if (state !== "ask" || !user) return null;

  const years = Array.from({ length: 101 }, (_, i) => new Date().getFullYear() - i);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const dob = { y: Number(y), m: Number(m), d: Number(d) };
    if (!validDob(dob)) { setErr("Enter your real date of birth."); return; }
    setBusy(true); setErr(null);
    try {
      if (ageOn(dob) >= MIN_AGE) {
        await confirmAdult(user.uid);
        welcome(user);
        setState("idle");
      } else {
        await declineMinor(user, dob);
        setState("declined");
      }
    } catch {
      setErr("Couldn't save that. Check your connection and try again.");
    } finally { setBusy(false); }
  };

  return (
    <div className="age-gate" role="dialog" aria-modal="true" aria-labelledby="age-title">
      <form className="age-card" onSubmit={submit}>
        <h2 id="age-title">Confirm your age</h2>
        <p>CricSynthesis accounts are for people aged {MIN_AGE} and over. Please enter your date of birth.</p>
        <div className="age-row">
          <label><span>Day</span><select value={d} onChange={(e) => setD(e.target.value)} required>
            <option value="">–</option>{Array.from({ length: 31 }, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}</select></label>
          <label><span>Month</span><select value={m} onChange={(e) => setM(e.target.value)} required>
            <option value="">–</option>{MONTHS.map((n, i) => <option key={n} value={i + 1}>{n}</option>)}</select></label>
          <label><span>Year</span><select value={y} onChange={(e) => setY(e.target.value)} required>
            <option value="">–</option>{years.map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
        </div>
        {err && <p className="error-box" role="alert">{err}</p>}
        <p className="small muted">We only keep a note that you confirmed you&apos;re {MIN_AGE} or over, not your date of birth.
          See our <a href="/privacy/#age">privacy policy</a>.</p>
        <div className="age-btns">
          <button type="submit" className="cs-btn cs-btn--primary" disabled={busy}>{busy ? "Checking…" : "Continue"}</button>
          <button type="button" className="cs-btn cs-btn--secondary" disabled={busy}
                  onClick={async () => { const { signOut } = await import("firebase/auth"); const { auth } = await import("@/lib/firebase"); await signOut(auth()); }}>Sign out</button>
        </div>
      </form>
    </div>
  );
}
