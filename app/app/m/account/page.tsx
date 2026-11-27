"use client";
// App account: profile, plan, the website's account pages, and logging out. Theme and alerts live in App settings.
import { signOut } from "firebase/auth";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AppGate, MenuGroup, MenuRow, TopBar, initials } from "@/components/App";
import { proLine } from "@/components/ProOffer";
import { canPause, cancelPro, hasPaidPro, needsAttention, pausePro, resumePro, useProBilling } from "@/lib/billing";
import { auth, usePlan } from "@/lib/firebase";
import { CANCEL_REASONS, PRO, rupees } from "@/lib/pro";
import { signOutNative } from "@/lib/native";
import { SITE } from "@/lib/seo";

function svgPath(d: string) {
  return <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>;
}
const KEY = svgPath("M15 7a4 4 0 1 1-3.9 4.9L4 19v2h3v-2h2v-2h2l1.1-1.1A4 4 0 0 1 15 7z");
const MAIL = svgPath("M3 6h18v12H3zM3 7l9 6 9-6");
const BIN = svgPath("M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3");

function Account() {
  const { user, plan, source } = usePlan();
  const router = useRouter();
  if (!user) return null;
  const logOut = async () => { await signOutNative(); await signOut(auth()); router.replace("/m/login/"); };
  return (
    <>
      <div className="a-title" style={{ paddingBottom: 12 }}><h1>Account</h1></div>
      <div className="a-who">
        <span className="a-avatar">{initials(user.displayName || user.email || "?")}</span>
        <div><h1>{user.displayName || "Your account"}</h1><p>{user.email}</p></div>
      </div>
      <MenuGroup label="Plan"><PlanPanel pro={plan === "pro"} comp={source === "comp"} uid={user.uid} /></MenuGroup>
      <MenuGroup label="On the website">
        <MenuRow icon={KEY} title="API keys and usage" href={`${SITE}/account/`} />
        <MenuRow icon={MAIL} title="Email preferences" href={`${SITE}/account/`} />
        <MenuRow icon={BIN} title="Delete your account" href={`${SITE}/contact/`} />
      </MenuGroup>
      <button type="button" className="a-btn soft" onClick={logOut}>Log out</button>
    </>
  );
}

function PlanPanel({ pro, comp, uid }: { pro: boolean; comp: boolean; uid: string }) {
  const b = useProBilling(uid);
  const paid = hasPaidPro(b);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const attention = needsAttention(b);
  const canCancel = !!b && !b.cancelAtEnd && (paid || b.status === "paused") && ["trial", "active", "past_due", "paused"].includes(b.status);
  const price = b?.billing === "yearly" ? `${rupees(PRO.yearly)} a year` : `${rupees(PRO.monthly)} a month`;
  const run = async (f: () => Promise<unknown>) => {
    setBusy(true); setErr(null);
    try { await f(); setConfirm(false); } catch (e) { setErr(e instanceof Error ? e.message : "Something went wrong. Please try again."); }
    finally { setBusy(false); }
  };
  const fmt = (d: Date | null) => d?.toLocaleDateString("en-IN", { day: "numeric", month: "long" }) ?? "";
  const restartOn = b?.currentEnd ? new Date(b.currentEnd.getTime() + 30 * 86400_000) : null;
  return (
    <div className="a-panel" style={{ display: "grid", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
        <h2>{pro ? "CricSynthesis Pro" : "Free"}</h2>
        {paid && <span className="small muted">{b!.status === "trial" ? "Free day" : price}</span>}
      </div>
      <p>{paid || attention ? proLine(b!) : comp ? "Pro is on for your account." : "The Overview for every match. Pro opens every tab and MatchSynth Lab."}</p>
      {!pro && <Link href="/m/pro/" className="a-btn">Get CricSynthesis Pro</Link>}
      {b?.status === "paused" && b.pausedByUs && <button type="button" className="a-btn soft" onClick={() => run(resumePro)} disabled={busy}>
        {busy ? "Restarting…" : "Restart now"}</button>}
      {canCancel && !confirm && <button type="button" className="a-btn plain" onClick={() => setConfirm(true)}>Cancel plan</button>}
      {confirm && (
        <>
          {canPause(b) && (
            <div className="pro-pause">
              <p style={{ margin: "0 0 8px" }}><b>Taking a break?</b> Pause for a month instead. Pro stays on until {fmt(b!.currentEnd)},
                nothing is charged while it&apos;s paused, and it restarts on {fmt(restartOn)}.</p>
              <button type="button" className="a-btn" onClick={() => run(pausePro)} disabled={busy}>{busy ? "Pausing…" : "Pause for a month"}</button>
            </div>
          )}
          <p>{b!.status === "trial" ? "Cancel your free day? You won't be charged, and Pro stays on until it ends."
            : "Cancel CricSynthesis Pro? You keep Pro until the end of the period you've paid for, and it won't renew."}</p>
          <fieldset className="pro-why">
            <legend>Why are you leaving? (optional)</legend>
            {CANCEL_REASONS.map(([id, label]) => (
              <label key={id}><input type="radio" name="cancel-reason" value={id} checked={reason === id} onChange={() => setReason(id)} /> {label}</label>
            ))}
            <textarea rows={2} maxLength={300} placeholder="Anything we could do better? (optional)" value={note} onChange={(e) => setNote(e.target.value)} aria-label="Anything we could do better" />
          </fieldset>
          <button type="button" className="a-btn soft" onClick={() => run(() => cancelPro(reason, note))} disabled={busy}>{busy ? "Cancelling…" : "Cancel plan"}</button>
          <button type="button" className="a-btn soft" onClick={() => setConfirm(false)} disabled={busy}>Keep Pro</button>
        </>
      )}
      {err && <div className="a-msg" role="alert">{err}</div>}
    </div>
  );
}

export default function AccountPage() {
  return <><TopBar back="/m/matches/" /><AppGate><Account /></AppGate></>;
}
