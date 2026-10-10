"use client";
import {
  createUserWithEmailAndPassword, GoogleAuthProvider, sendPasswordResetEmail, signInWithEmailAndPassword, signInWithPopup,
} from "firebase/auth";
import { useEffect, useState } from "react";
import { Logo } from "@/components/Shell";
import { auth, useUser } from "@/lib/firebase";

const MESSAGES: Record<string, string> = {
  "auth/invalid-credential": "Email or password is wrong.",
  "auth/email-already-in-use": "There is already an account with this email. Sign in instead.",
  "auth/weak-password": "Use at least 6 characters for the password.",
  "auth/invalid-email": "That email address doesn't look right.",
  "auth/popup-closed-by-user": "The Google window was closed before signing in.",
  "auth/too-many-requests": "Too many attempts. Wait a minute and try again.",
  "auth/configuration-not-found": "Sign-in isn't available yet. Please try again later.",
  "auth/unauthorized-domain": "Sign-in isn't enabled on this address yet. Please use cricsynthesis.web.app for now.",
  "auth/popup-blocked": "Your browser blocked the Google window. Allow pop-ups for this site and try again.",
  "auth/operation-not-allowed": "This sign-in method isn't switched on yet.",
};
const explain = (e: unknown) => MESSAGES[(e as { code?: string }).code ?? ""] ?? "Something went wrong. Please try again.";

function next(): string {
  const n = new URLSearchParams(window.location.search).get("next");
  return n && n.startsWith("/") && !n.startsWith("//") ? n : "/account/";
}

export default function Login() {
  const user = useUser();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [emailOpen, setEmailOpen] = useState(false);

  useEffect(() => { if (user) window.location.replace(next()); }, [user]);

  const run = async (f: () => Promise<unknown>) => {
    setBusy(true); setErr(null); setInfo(null);
    try { await f(); } catch (e) { setErr(explain(e)); } finally { setBusy(false); }
  };
  const google = () => run(() => signInWithPopup(auth(), new GoogleAuthProvider()));
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    run(() => mode === "in" ? signInWithEmailAndPassword(auth(), email, password)
                            : createUserWithEmailAndPassword(auth(), email, password));
  };
  const reset = () => {
    if (!email) { setErr("Enter your email first, then press “Forgot password”."); return; }
    run(async () => { await sendPasswordResetEmail(auth(), email); setInfo("Check your inbox for a reset link."); });
  };

  return (
    <div className="login-wrapper">
      <div className="login-card">
        <a href="/" className="login-logo cs-brand" aria-label="CricSynthesis home"><Logo /><span>Cric<b>Synthesis</b></span></a>
        <h1>{mode === "up" ? "Create account" : "Sign in"}</h1>
        <p className="login-sub">{mode === "up" ? "Every account gets Pro free during the beta, including MatchSynth Lab."
                                                : "Sign in to open MatchSynth Lab and manage your account."}</p>
        {err && <div className="error-box" role="alert">{err}</div>}
        {info && <div className="error-box info" role="status">{info}</div>}
        <button type="button" className="google-btn" onClick={google} disabled={busy}>
          {busy ? <span className="spinner" /> : (
            <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
          )}
          {busy ? "Signing in…" : "Continue with Google"}
        </button>
        {!emailOpen ? (
          <button type="button" className="linkbtn login-email-toggle" onClick={() => setEmailOpen(true)}>Use email instead</button>
        ) : (
          <form onSubmit={submit} className="login-form">
            <label className="form-label" htmlFor="email">Email</label>
            <input id="email" type="email" className="form-input" autoComplete="email" required value={email}
                   onChange={(e) => setEmail(e.target.value)} />
            <label className="form-label" htmlFor="password">Password</label>
            <input id="password" type="password" className="form-input" required minLength={6} value={password}
                   autoComplete={mode === "in" ? "current-password" : "new-password"} onChange={(e) => setPassword(e.target.value)} />
            <button type="submit" className="google-btn" disabled={busy}>{mode === "in" ? "Sign in with email" : "Create account"}</button>
            <p className="login-alt">
              {mode === "in"
                ? <>New here? <button type="button" className="linkbtn" onClick={() => setMode("up")}>Create an account</button> · <button type="button" className="linkbtn" onClick={reset}>Forgot password</button></>
                : <>Already have an account? <button type="button" className="linkbtn" onClick={() => setMode("in")}>Sign in</button></>}
            </p>
          </form>
        )}
        <div className="divider" />
        <p className="login-footer">
          By signing in you agree to our <a href="/terms/">Terms of Service</a> and <a href="/privacy/">Privacy Policy</a>.
          <br /><br />Need API access? <a href="/contact/">Contact sales →</a>
        </p>
      </div>
    </div>
  );
}
