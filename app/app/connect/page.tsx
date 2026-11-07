"use client";
// The MCP connector's sign-in (edge/src/oauth.ts): an AI assistant sends the user here to sign in and allow it.
// The request (?req=) is signed by our server; this page only reads the client's name and where it returns to,
// and sends the user's sign-in token to our own MCP server, never to another host.
import { signOut } from "firebase/auth";
import { useEffect, useState } from "react";
import { Logo } from "@/components/Shell";
import { auth, useUser } from "@/lib/firebase";

const SERVERS = ["https://mcp.cricsynthesis.in", "https://api.cricsynthesis.in", "https://cricsynthesis-api.rangasiyaar.workers.dev"];

type Req = { n?: string; ru?: string; aud?: string; exp?: number };

function readReq(raw: string | null): Req | null {
  if (!raw) return null;
  try {
    const b = raw.split(".")[0].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(b + "===".slice((b.length + 3) % 4)), (c) => c.charCodeAt(0))));
  } catch { return null; }
}

export default function Connect() {
  const user = useUser();
  const [raw, setRaw] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { setRaw(new URLSearchParams(window.location.search).get("req")); }, []);

  const req = readReq(raw);
  const expired = !req || !req.exp || req.exp * 1000 < Date.now();
  const server = req?.aud && SERVERS.includes(req.aud) ? req.aud : null;
  const client = req?.n || "An AI assistant";
  let returnsTo = "";
  try { returnsTo = req?.ru ? new URL(req.ru).host : ""; } catch {}

  async function answer(allow: boolean) {
    if (!server || !raw) return;
    setBusy(true); setErr(null);
    try {
      const idToken = allow && user ? await user.getIdToken() : undefined;
      const r = await fetch(`${server}/oauth/complete`, { method: "POST", headers: { "Content-Type": "application/json" },
                                                          body: JSON.stringify({ req: raw, id_token: idToken, allow }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.redirect) throw new Error(j.detail || "Couldn't finish connecting. Start again from your app.");
      window.location.assign(j.redirect);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  const next = raw ? `/login/?next=${encodeURIComponent(`/connect/?req=${raw}`)}` : "/login/";
  return (
    <div className="login-wrapper">
      <div className="login-card">
        <a href="/" className="login-logo cs-brand" aria-label="CricSynthesis home"><Logo /><span>Cric<b>Synthesis</b></span></a>
        {raw === null ? <div className="skeleton" style={{ height: 120 }} aria-busy="true" /> : expired || !server ? (<>
          <h1>Link expired</h1>
          <p className="login-sub">This connect link is no longer valid. Start connecting again from your AI assistant.</p>
          <a className="cs-btn cs-btn--secondary" href="/mcp/">About the connector</a>
        </>) : user === undefined ? <div className="skeleton" style={{ height: 120 }} aria-busy="true" /> : !user ? (<>
          <h1>Connect {client}</h1>
          <p className="login-sub">Sign in to CricSynthesis to let {client} use our cricket analytics, forecasts and fantasy picks.</p>
          <a className="cs-btn cs-btn--primary" href={next} style={{ width: "100%", justifyContent: "center" }}>Sign in to continue</a>
        </>) : (<>
          <h1>Connect {client}</h1>
          <p className="login-sub">{client} wants to use CricSynthesis with your account.</p>
          {err && <div className="error-box" role="alert">{err}</div>}
          <ul className="small" style={{ paddingLeft: 18, lineHeight: 1.7, color: "var(--cs-ink-2)", margin: "4px 0 18px" }}>
            <li>Read match forecasts, player and venue analytics, fantasy picks and share cards</li>
            <li>Up to 200 tool calls a day, counted on your account</li>
            <li>It can&apos;t see or change your account, profile or API keys</li>
          </ul>
          <button type="button" className="cs-btn cs-btn--primary" onClick={() => answer(true)} disabled={busy}
                  style={{ width: "100%", justifyContent: "center" }}>{busy ? "Connecting…" : "Allow"}</button>
          <button type="button" className="cs-btn cs-btn--secondary" onClick={() => answer(false)} disabled={busy}
                  style={{ width: "100%", justifyContent: "center", marginTop: 10 }}>Cancel</button>
          <p className="small muted" style={{ marginTop: 16 }}>
            Signed in as {user.email || "your account"} · <button type="button" className="linkbtn" onClick={() => signOut(auth())}>Not you?</button>
            {returnsTo && <><br />You&apos;ll go back to {returnsTo}.</>}</p>
        </>)}
      </div>
    </div>
  );
}
