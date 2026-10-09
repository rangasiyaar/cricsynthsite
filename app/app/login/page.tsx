"use client";
import {
  createUserWithEmailAndPassword, GoogleAuthProvider, sendPasswordResetEmail, signInWithEmailAndPassword, signInWithPopup,
} from "firebase/auth";
import { useEffect, useState } from "react";
import { auth, useUser } from "@/lib/firebase";

const MESSAGES: Record<string, string> = {
  "auth/invalid-credential": "Email or password is wrong.",
  "auth/email-already-in-use": "There is already an account with this email. Sign in instead.",
  "auth/weak-password": "Use at least 6 characters for the password.",
  "auth/invalid-email": "That email address doesn't look right.",
  "auth/popup-closed-by-user": "The Google window was closed before signing in.",
  "auth/too-many-requests": "Too many attempts. Wait a minute and try again.",
  "auth/configuration-not-found": "Sign-in isn't switched on yet. Please try again later.",
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
    <div className="page-head auth-page">
      <p className="cs-eyebrow">Account</p>
      <h1><span>{mode === "in" ? "Sign in." : "Create an account."}</span><span>Free during beta.</span></h1>
      <p className="cs-lede">Accounts are free during the launch beta and include every Pro lever in the Scenario Lab.</p>
      <div className="card auth-card">
        <button type="button" className="btn ghost auth-google" onClick={google} disabled={busy}>
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.5 5.5 0 0 1-2.4 3.6v3h3.9c2.2-2.1 3.5-5.1 3.5-8.7Z" />
            <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24Z" />
            <path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6h-4a12 12 0 0 0 0 10.8l4-3.1Z" />
            <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9Z" />
          </svg>
          Continue with Google
        </button>
        <div className="auth-or"><span>or with email</span></div>
        <form onSubmit={submit} className="auth-form">
          <label className="form-label" htmlFor="email">Email</label>
          <input id="email" type="email" className="form-input" autoComplete="email" required value={email}
                 onChange={(e) => setEmail(e.target.value)} />
          <label className="form-label" htmlFor="password">Password</label>
          <input id="password" type="password" className="form-input" required minLength={6} value={password}
                 autoComplete={mode === "in" ? "current-password" : "new-password"} onChange={(e) => setPassword(e.target.value)} />
          <button type="submit" className="btn" disabled={busy}>{mode === "in" ? "Sign in" : "Create account"}</button>
        </form>
        {err && <p className="notice" role="alert">{err}</p>}
        {info && <p className="notice" role="status">{info}</p>}
        <p className="small muted auth-links">
          {mode === "in"
            ? <>New here? <button type="button" className="linkbtn" onClick={() => setMode("up")}>Create an account</button> · <button type="button" className="linkbtn" onClick={reset}>Forgot password</button></>
            : <>Already have an account? <button type="button" className="linkbtn" onClick={() => setMode("in")}>Sign in</button></>}
        </p>
        <p className="small muted">By continuing you agree to the <a href="/terms/">terms</a> and <a href="/privacy/">privacy policy</a>.</p>
      </div>
    </div>
  );
}
