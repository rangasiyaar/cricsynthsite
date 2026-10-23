"use client";
// App sign-in: the website's login card. Google goes through the phone's account picker inside the app.
import {
  createUserWithEmailAndPassword, GoogleAuthProvider, sendPasswordResetEmail, signInWithEmailAndPassword, signInWithPopup,
} from "firebase/auth";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Logo } from "@/components/Shell";
import { explain } from "@/lib/auth-messages";
import { auth, useUser } from "@/lib/firebase";
import { hasNativeGoogle, isNative, signInWithGoogleNative } from "@/lib/native";
import { SITE } from "@/lib/seo";
import { welcome } from "@/lib/welcome";

/** Where to go after signing in: only an app screen. */
function next(): string {
  const n = new URLSearchParams(window.location.search).get("next");
  return n && /^\/m\/[\w/?=&%.-]*$/.test(n) && !n.includes("//") ? n : "/m/matches/";
}

export default function AppLogin() {
  const user = useUser();
  const router = useRouter();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [google, setGoogle] = useState(true);
  const [emailOpen, setEmailOpen] = useState(false);
  const [forLab, setForLab] = useState(false);
  useEffect(() => { setForLab(next().startsWith("/m/lab/")); }, []);

  // Google needs the native plugin inside the app; without it the app offers email only.
  useEffect(() => { const g = !isNative() || hasNativeGoogle(); setGoogle(g); if (!g) setEmailOpen(true); }, []);
  useEffect(() => { if (user && !busy) router.replace(next()); }, [user, busy, router]);

  const run = async (f: () => Promise<unknown>) => {
    setBusy(true); setErr(null); setInfo(null);
    try { await f(); } catch (e) { setErr(explain(e)); } finally { setBusy(false); }
  };
  const withGoogle = () => run(async () => welcome(isNative() ? await signInWithGoogleNative()
                                                              : await signInWithPopup(auth(), new GoogleAuthProvider())));
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => welcome(mode === "in" ? await signInWithEmailAndPassword(auth(), email, password)
                                          : await createUserWithEmailAndPassword(auth(), email, password)));
  };
  const reset = () => {
    if (!email) { setErr("Enter your email first, then press “Forgot password”."); return; }
    run(async () => { await sendPasswordResetEmail(auth(), email); setInfo("Check your inbox for a reset link."); });
  };

  return (
    <div className="a-login">
      <div className="a-brand"><Logo /><span>Cric<b>Synthesis</b></span></div>
      <div className="a-login-hero">
        <h1>{mode === "up" ? <>Create your<br /><span>account.</span></> : <>Every match,<br /><span>simulated.</span></>}</h1>
        <p>{forLab ? "MatchSynth Lab is part of Pro, and Pro is free for every account during the beta. Sign in or create an account to open it."
          : mode === "up" ? "Every account gets Pro free during the beta, including MatchSynth Lab."
          : "Win chances, projected scores and fantasy picks before the first ball. Sign in to open MatchSynth Lab."}</p>
      </div>
      <div className="a-login-form">
        {err && <div className="a-msg" role="alert">{err}</div>}
        {info && <div className="a-msg info" role="status">{info}</div>}
        {google && (
          <button type="button" className="a-btn soft" onClick={withGoogle} disabled={busy}>
            <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
            {busy && !emailOpen ? "Signing in…" : "Continue with Google"}
          </button>
        )}
        {google && <div className="a-or">or</div>}
        {!emailOpen ? (
          <button type="button" className="a-btn soft" onClick={() => setEmailOpen(true)}>Continue with email</button>
        ) : (
          <form onSubmit={submit} className="a-login-form">
            <div className="a-field"><label htmlFor="email">Email</label>
              <input id="email" type="email" autoComplete="email" inputMode="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            <div className="a-field"><label htmlFor="password">Password</label>
              <input id="password" type="password" required minLength={6} value={password}
                     autoComplete={mode === "in" ? "current-password" : "new-password"} onChange={(e) => setPassword(e.target.value)} /></div>
            <button type="submit" className="a-btn" disabled={busy}>{busy ? "Please wait…" : mode === "in" ? "Sign in" : "Create account"}</button>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              {mode === "in"
                ? <><button type="button" className="a-btn plain" style={{ width: "auto" }} onClick={() => setMode("up")}>Create an account</button>
                    <button type="button" className="a-btn plain" style={{ width: "auto" }} onClick={reset}>Forgot password</button></>
                : <button type="button" className="a-btn plain" style={{ width: "auto" }} onClick={() => setMode("in")}>I already have an account</button>}
            </div>
          </form>
        )}
        <Link href="/m/matches/" className="a-btn plain">Skip for now</Link>
      </div>
      <p className="a-login-foot">
        Forecasts are free without an account. By signing in you agree to our <a href={`${SITE}/terms/`}>Terms of Service</a> and <a href={`${SITE}/privacy/`}>Privacy Policy</a>.
      </p>
    </div>
  );
}
