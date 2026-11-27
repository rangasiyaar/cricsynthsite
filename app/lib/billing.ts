"use client";
// CricSynthesis Pro billing on the website: the account's billing record (Firestore users/{uid}/billing/pro, written only
// by the API from Razorpay), and the checkout (Razorpay's own window; we never see card or UPI details).
import { doc, onSnapshot, type Timestamp } from "firebase/firestore";
import { useEffect, useState } from "react";
import { API } from "./apiref";
import { auth, db } from "./firebase";
import type { Billing } from "./pro";

export type ProBilling = {
  status: "created" | "trial" | "active" | "past_due" | "halted" | "cancelled" | "paused" | "ended" | string;
  billing: Billing | null; proUntil: Date | null; trialEnd: Date | null; currentEnd: Date | null;
  cancelAtEnd: boolean; trialUsed: boolean;
  paidCount: number; pausedByUs: boolean; resumeOn: Date | null;     // pausedByUs: the account's own "pause for a month"
};

const toDate = (v: unknown) => (v && typeof (v as Timestamp).toDate === "function" ? (v as Timestamp).toDate() : null);

/** Live billing record for this account: undefined while loading, null when there is none. */
export function useProBilling(uid: string | null | undefined): ProBilling | null | undefined {
  const [b, setB] = useState<ProBilling | null | undefined>(undefined);
  useEffect(() => {
    if (!uid) { setB(uid === null ? null : undefined); return; }
    return onSnapshot(doc(db(), "users", uid, "billing", "pro"), (s) => {
      const d = s.data();
      setB(d ? { status: d.status, billing: d.billing ?? null, proUntil: toDate(d.proUntil), trialEnd: toDate(d.trialEnd),
                 currentEnd: toDate(d.currentEnd), cancelAtEnd: d.cancelAtEnd === true, trialUsed: d.trialUsed === true,
                 paidCount: Number(d.paidCount || 0), pausedByUs: d.pausedByUs === true, resumeOn: toDate(d.resumeOn) } : null);
    }, () => setB(null));
  }, [uid]);
  return b;
}

export const hasPaidPro = (b: ProBilling | null | undefined) => !!b?.proUntil && b.proUntil.getTime() > Date.now();
export const trialAvailable = (b: ProBilling | null | undefined) => !b?.trialUsed;

async function call(path: string, body?: unknown) {
  const u = auth().currentUser;
  if (!u) throw new Error("Please sign in first.");
  const r = await fetch(`${API}/billing/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { Authorization: `Bearer ${await u.getIdToken()}`, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.detail || "Something went wrong. Please try again.");
  return j;
}

export const refreshBilling = () => call("status");
/** Cancel, with the exit survey's answer (both optional). */
export const cancelPro = (reason?: string | null, note?: string) => call("cancel", { reason: reason || null, note: note?.trim() || null });
/** "Pause for a month" (a paid plan) and restarting it early. */
export const pausePro = () => call("pause", {});
export const resumePro = () => call("resume", {});
/** A plan that can be paused instead of cancelled: paid for, renewing. */
export const canPause = (b: ProBilling | null | undefined) => !!b && b.status === "active" && b.paidCount > 0 && !b.cancelAtEnd;
/** Statuses the account page always explains, even after Pro has lapsed (so the customer can fix it). */
export const needsAttention = (b: ProBilling | null | undefined) => !!b && ["paused", "halted", "past_due"].includes(b.status);

type RazorpayResponse = { razorpay_payment_id: string; razorpay_subscription_id: string; razorpay_signature: string };
declare global { interface Window { Razorpay?: new (o: Record<string, unknown>) => { open(): void; on(e: string, f: (r: unknown) => void): void } } }

function loadCheckout(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  return new Promise((ok, bad) => {
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.async = true;
    s.onload = () => ok();
    s.onerror = () => bad(new Error("The payment window couldn't load. Check your connection and try again."));
    document.head.appendChild(s);
  });
}

type Where = "web" | "app";
type RazorpayFailure = { error?: { code?: string; description?: string; source?: string; step?: string; reason?: string;
                                   metadata?: { payment_id?: string } } };

/** Tells our API a payment didn't go through, and where (website or app), for the team's console. Razorpay's error only:
 *  it never includes card or UPI details. Best effort: a failure to report never gets in the customer's way. */
function report(kind: "failed" | "error" | "closed", where: Where, billing: Billing, e: RazorpayFailure["error"] | { description: string } = {}) {
  const x = e as NonNullable<RazorpayFailure["error"]>;
  call("attempt", { kind, where, billing, code: x.code, description: x.description, source: x.source, step: x.step,
                    reason: x.reason, paymentId: x.metadata?.payment_id }).catch(() => {});
}

/** Opens Razorpay's checkout for CricSynthesis Pro. Resolves "done" once the payment is verified, "closed" if they closed it. */
export async function startCheckout(billing: Billing, where: Where = "web"): Promise<"done" | "closed"> {
  let c: { key: string; subscription_id: string; trial: boolean; email: string | null };
  try { [c] = await Promise.all([call("checkout", { billing, where }), loadCheckout()]); }
  catch (e) { report("error", where, billing, { description: e instanceof Error ? e.message : "checkout failed" }); throw e; }
  let failed = false;
  return new Promise((resolve, reject) => {
    const rz = new window.Razorpay!({
      key: c.key, subscription_id: c.subscription_id, name: "CricSynthesis", image: "https://cricsynthesis.in/brand-logo.png",
      description: `CricSynthesis Pro (${billing})${c.trial ? " · 1 day free" : ""}`,
      prefill: { email: c.email || "" }, theme: { color: "#416180" }, notes: { product: "pro" },
      // in the app's web view, show UPI apps too (the Android shell opens the UPI link in GPay, PhonePe, Paytm...)
      ...(where === "app" ? { webview_intent: true } : {}),
      handler: (resp: RazorpayResponse) => {
        call("verify", resp).then(() => resolve("done"), (e) => { report("error", where, billing, { description: `verify: ${e instanceof Error ? e.message : e}` }); reject(e); });
      },
      modal: { ondismiss: () => { if (!failed) report("closed", where, billing); resolve("closed"); }, confirm_close: true },
    });
    // Razorpay shows the error and lets them retry; we record each failure with where it happened
    rz.on("payment.failed", (r) => { failed = true; report("failed", where, billing, (r as RazorpayFailure).error); });
    rz.open();
  });
}

/** The checkout page's state (website /checkout/ and the app's /m/checkout/): account, plan status, and pay(). */
export function useCheckout(billing: Billing, where: "web" | "app") {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [uid, setUid] = useState<string | null | undefined>(undefined);
  const [email, setEmail] = useState<string | null>(null);
  useEffect(() => auth().onAuthStateChanged((u) => { setUid(u ? u.uid : null); setEmail(u?.email ?? null); }), []);
  const b = useProBilling(uid);
  const paid = hasPaidPro(b);
  const trial = trialAvailable(b);
  const pay = async () => {
    if (busy || !uid) return;
    setBusy(true); setErr(null);
    void import("./analytics").then((a) => a.track("pro_checkout", { billing, trial, where }));
    try {
      if ((await startCheckout(billing, where)) === "done") {
        setDone(true);
        void import("./analytics").then((a) => a.track("pro_subscribed", { billing, trial, where }));
      }
    } catch (e) { setErr(e instanceof Error ? e.message : "Something went wrong. Please try again."); }
    finally { setBusy(false); }
  };
  return { uid, email, b, paid, trial, busy, err, done, pay };
}

/** When the first charge falls if the free day starts now. */
export const firstChargeDate = () => new Date(Date.now() + 24 * 3600_000);
