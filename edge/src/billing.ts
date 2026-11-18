// CricSynthesis Pro billing with Razorpay Subscriptions (monthly ₹349, yearly ₹3,769), with one free day for accounts
// that have never had it (the first charge is scheduled 24 h after sign-up: Razorpay's start_at).
//
//   POST /billing/checkout {billing}   (signed in, 18+)  → a Razorpay subscription for the website's checkout
//   POST /billing/verify   {razorpay_*}                  → checks the checkout's signature, turns Pro on straight away
//   POST /billing/cancel                                 → cancels at the end of the paid period (a free day: at once,
//                                                          keeping Pro until it ends)
//   GET  /billing/status                                 → the account's Pro billing (refreshed from Razorpay when stale)
//   POST /billing/webhook                                → Razorpay events (signed with RAZORPAY_WEBHOOK_SECRET)
//
// The result lives in Firestore users/{uid}/billing/pro, written only here; the website and app read it (rules allow
// the owner to read) and treat Pro as on while proUntil is in the future. Missed renewals get 3 days' grace.
export type Billing = "monthly" | "yearly";
export type Rec = Record<string, unknown>;

export const PRICE: Record<Billing, number> = { monthly: 34_900, yearly: 376_900 };     // paise
const PLAN_NAME: Record<Billing, string> = { monthly: "CricSynthesis Pro (monthly)", yearly: "CricSynthesis Pro (yearly)" };
const CYCLES: Record<Billing, number> = { monthly: 120, yearly: 10 };                    // Razorpay needs an upper bound
export const TRIAL_S = 24 * 3600;
const GRACE_S = 3 * 24 * 3600;
const TRIAL_BUFFER_S = 6 * 3600;           // time for the first charge (and its webhook) after the free day
const STALE_MS = 30 * 60_000;

export class BillingError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

export interface Store {
  get(path: string): Promise<Rec | null>;
  set(path: string, fields: Rec): Promise<void>;
}

export interface Deps {
  keyId: string; keySecret: string; webhookSecret?: string;
  store: Store;
  rzp: (method: string, path: string, body?: unknown) => Promise<any>;
  now: () => number;                       // ms
}

/** Razorpay's REST API with the key pair (Basic auth). */
export function razorpay(keyId: string, keySecret: string, fetcher: typeof fetch = (i, init) => fetch(i, init)) {
  const auth = "Basic " + btoa(`${keyId}:${keySecret}`);
  return async (method: string, path: string, body?: unknown) => {
    const r = await fetcher(`https://api.razorpay.com/v1${path}`, {
      method, headers: { Authorization: auth, "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body),
    });
    const j: any = await r.json().catch(() => ({}));
    if (!r.ok) throw new BillingError(r.status >= 500 ? 502 : 400, j?.error?.description || `Payment provider error (${r.status})`);
    return j;
  };
}

const enc = new TextEncoder();
export async function hmacHex(secret: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(msg)));
  return [...sig].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function sameHex(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

const docPath = (uid: string) => `users/${encodeURIComponent(uid)}/billing/pro`;
const at = (s: number | null | undefined) => (s ? new Date(s * 1000) : null);
const ms = (v: unknown) => (typeof v === "string" ? Date.parse(v) : v instanceof Date ? v.getTime() : NaN);

/** What a Razorpay subscription means for access: our status, and Pro until when. */
export function accessFrom(sub: any): { status: string; proUntil: Date | null; trialEnd: Date | null; currentEnd: Date | null; trialUsed: boolean } {
  const s = String(sub.status || "");
  const paid = Number(sub.paid_count || 0);
  const trialEnd = paid === 0 && sub.start_at ? at(sub.start_at) : null;
  const end = sub.current_end || null;
  const base = { trialEnd, currentEnd: at(end), trialUsed: s !== "created" };
  switch (s) {
    case "authenticated": return { ...base, status: "trial", proUntil: at((sub.start_at || 0) + TRIAL_BUFFER_S) };
    case "active": return { ...base, status: "active", proUntil: at(end ? end + GRACE_S : null) };
    case "pending": return { ...base, status: "past_due", proUntil: at(end ? end + GRACE_S : (sub.start_at || 0) + TRIAL_BUFFER_S) };
    case "halted": return { ...base, status: "halted", proUntil: at(end) };
    case "cancelled": return { ...base, status: "cancelled", proUntil: at(paid > 0 ? end : sub.start_at) };
    case "paused": return { ...base, status: "paused", proUntil: at(end) };
    case "completed": case "expired": return { ...base, status: "ended", proUntil: at(end) };
    default: return { ...base, status: "created", proUntil: null, trialUsed: false };
  }
}

/** The account's Pro billing as the website shows it. */
export function publicView(d: Rec | null, now: number) {
  if (!d) return { status: "none", pro: false, trialAvailable: true };
  const until = ms(d.proUntil);
  return {
    status: d.status, billing: d.billing ?? null, pro: Number.isFinite(until) && until > now,
    proUntil: d.proUntil ?? null, trialEnd: d.trialEnd ?? null, currentEnd: d.currentEnd ?? null,
    cancelAtEnd: d.cancelAtEnd === true, trialAvailable: d.trialUsed !== true,
  };
}

async function planId(deps: Deps, billing: Billing): Promise<string> {
  const mode = deps.keyId.startsWith("rzp_live_") ? "live" : "test";
  const field = `pro_${billing}_${PRICE[billing]}_${mode}`;
  const cfg = (await deps.store.get("billingConfig/razorpay")) || {};
  if (typeof cfg[field] === "string") return cfg[field] as string;
  const plan = await deps.rzp("POST", "/plans", {
    period: billing, interval: 1, notes: { product: "pro" },
    item: { name: PLAN_NAME[billing], amount: PRICE[billing], currency: "INR",
            description: "Every match centre tab for every covered match, plus MatchSynth Lab." },
  });
  await deps.store.set("billingConfig/razorpay", { [field]: plan.id });
  return plan.id;
}

async function save(deps: Deps, uid: string, sub: any, extra: Rec = {}) {
  const prev = (await deps.store.get(docPath(uid))) || {};
  const a = accessFrom(sub);
  const fields: Rec = {
    product: "pro", subscriptionId: sub.id, rzStatus: sub.status, status: a.status, proUntil: a.proUntil,
    trialEnd: a.trialEnd, currentEnd: a.currentEnd, paidCount: Number(sub.paid_count || 0),
    trialUsed: prev.trialUsed === true || a.trialUsed, checked: new Date(deps.now()), updated: new Date(deps.now()), ...extra,
  };
  if (["cancelled", "ended", "halted"].includes(a.status)) fields.cancelAtEnd = false;
  await deps.store.set(docPath(uid), fields);
  return { ...prev, ...fields };
}

/** Start a subscription for the website's checkout. */
export async function checkout(deps: Deps, user: { uid: string; email: string | null }, body: any) {
  const billing: Billing = body?.billing === "monthly" ? "monthly" : body?.billing === "yearly" ? "yearly" : (() => {
    throw new BillingError(422, "billing must be monthly or yearly"); })();
  const now = deps.now();
  const prev = await deps.store.get(docPath(user.uid));
  const view = publicView(prev, now);
  if (view.pro && prev?.status !== "created" && prev?.status !== "cancelled") throw new BillingError(409, "You already have CricSynthesis Pro.");
  const trial = view.trialAvailable;
  const sub = await deps.rzp("POST", "/subscriptions", {
    plan_id: await planId(deps, billing), total_count: CYCLES[billing], quantity: 1, customer_notify: 1,
    ...(trial ? { start_at: Math.floor(now / 1000) + TRIAL_S } : {}),
    notes: { uid: user.uid, product: "pro", billing },
  });
  // keep any access still running (e.g. a cancelled plan's last days) until the new subscription is confirmed
  await deps.store.set(docPath(user.uid), { product: "pro", subscriptionId: sub.id, rzStatus: sub.status, billing,
                                            ...(view.pro ? {} : { status: "created" }), updated: new Date(now) });
  return { key: deps.keyId, subscription_id: sub.id, trial, billing, amount: PRICE[billing], email: user.email };
}

/** The checkout's success callback: check Razorpay's signature, then record the subscription. */
export async function verify(deps: Deps, uid: string, body: any) {
  const pay = String(body?.razorpay_payment_id || ""), subId = String(body?.razorpay_subscription_id || "");
  const sig = String(body?.razorpay_signature || "");
  if (!pay || !subId || !sig) throw new BillingError(422, "Missing payment details");
  if (!sameHex(await hmacHex(deps.keySecret, `${pay}|${subId}`), sig)) throw new BillingError(400, "Payment could not be verified");
  const prev = await deps.store.get(docPath(uid));
  if (prev?.subscriptionId !== subId) throw new BillingError(400, "This payment is for a different checkout");
  const sub = await deps.rzp("GET", `/subscriptions/${encodeURIComponent(subId)}`);
  if (sub?.notes?.uid !== uid) throw new BillingError(400, "This payment is for a different account");
  return publicView(await save(deps, uid, sub, { billing: sub.notes?.billing ?? prev?.billing ?? null, cancelAtEnd: false }), deps.now());
}

/** Cancel: a paid plan at the end of its period; a free day at once (Pro stays on until the free day ends). */
export async function cancel(deps: Deps, uid: string) {
  const prev = await deps.store.get(docPath(uid));
  const subId = prev?.subscriptionId as string | undefined;
  if (!subId) throw new BillingError(404, "No subscription to cancel");
  const cur = await deps.rzp("GET", `/subscriptions/${encodeURIComponent(subId)}`);
  if (["cancelled", "completed", "expired"].includes(cur.status)) return publicView(await save(deps, uid, cur), deps.now());
  const atEnd = cur.status === "active";
  const sub = await deps.rzp("POST", `/subscriptions/${encodeURIComponent(subId)}/cancel`, { cancel_at_cycle_end: atEnd ? 1 : 0 });
  return publicView(await save(deps, uid, sub, atEnd ? { cancelAtEnd: true } : {}), deps.now());
}

/** The account's Pro billing; refreshed from Razorpay when it's older than 30 minutes or Pro is about to lapse. */
export async function status(deps: Deps, uid: string) {
  let d = await deps.store.get(docPath(uid));
  const now = deps.now();
  if (d?.subscriptionId && d.status !== "created") {
    const until = ms(d.proUntil), checked = ms(d.checked);
    if (!Number.isFinite(checked) || now - checked > STALE_MS || (Number.isFinite(until) && until - now < 24 * 3600_000)) {
      try { d = await save(deps, uid, await deps.rzp("GET", `/subscriptions/${encodeURIComponent(String(d.subscriptionId))}`)); }
      catch (e) { console.error("billing refresh", e); }
    }
  }
  return publicView(d, now);
}

/** Razorpay webhook: subscription events update the account they belong to (notes.uid). */
export async function webhook(deps: Deps, raw: string, signature: string | null) {
  if (!deps.webhookSecret) throw new BillingError(503, "Webhook not configured");
  if (!signature || !sameHex(await hmacHex(deps.webhookSecret, raw), signature)) throw new BillingError(400, "Bad signature");
  let ev: any;
  try { ev = JSON.parse(raw); } catch { throw new BillingError(400, "Bad body"); }
  const sub = ev?.payload?.subscription?.entity;
  if (!String(ev?.event || "").startsWith("subscription.") || !sub?.id) return { ok: true, ignored: true };
  const uid = sub.notes?.uid;
  if (typeof uid !== "string" || !uid || sub.notes?.product !== "pro") return { ok: true, ignored: true };
  const prev = await deps.store.get(docPath(uid));
  // only the account's current checkout counts: no record (never checked out here, or reset by our team) or an older
  // subscription id means the event is ignored, so a late event can't bring back a plan that was removed
  if (!prev?.subscriptionId || prev.subscriptionId !== sub.id) return { ok: true, ignored: true };
  await save(deps, uid, sub, { billing: sub.notes?.billing ?? prev?.billing ?? null });
  return { ok: true };
}
