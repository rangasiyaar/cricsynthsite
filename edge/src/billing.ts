// CricSynthesis Pro billing with Razorpay Subscriptions (monthly ₹349, yearly ₹3,769), with one free day for accounts
// that have never had it (the first charge is scheduled 24 h after sign-up: Razorpay's start_at).
//
//   POST /billing/checkout {billing}   (signed in, 18+)  → a Razorpay subscription for the website's checkout
//   POST /billing/verify   {razorpay_*}                  → checks the checkout's signature, turns Pro on straight away
//   POST /billing/cancel   {reason?, note?}              → cancels at the end of the paid period (a free day: at once,
//                                                          keeping Pro until it ends), with the exit survey's answer
//   POST /billing/pause                                  → a paying plan skips a month: Pro runs to the end of the paid
//                                                          period, then restarts 30 days later (billingCron resumes it)
//   POST /billing/resume                                 → restart a paused plan now
//   GET  /billing/status                                 → the account's Pro billing (refreshed from Razorpay when stale)
//   POST /billing/attempt  {kind, where, …}              → the checkout page reports a failed payment, an error before
//                                                          the payment window or a closed window (for the console)
//   POST /billing/webhook                                → Razorpay events (signed with RAZORPAY_WEBHOOK_SECRET)
// billingCron (the Worker's scheduled run, every 3 hours): the free-day-ending reminder, the "having trouble paying?"
// email after an unfinished checkout, and restarting plans paused for a month.
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

/** Account emails the billing flow asks for (sent by notify.ts; each recorded on the billing doc so it goes once). */
export type Notice =
  | { kind: "started"; billing: Billing; amount: number; trial: boolean; firstCharge: Date }
  | { kind: "cancelled"; until: Date; trial: boolean }
  | { kind: "failed"; billing: Billing; amount: number; graceUntil: Date; first?: boolean }
  | { kind: "paused"; until: Date | null }                                  // autopay paused in the UPI app or bank
  | { kind: "pausedByYou"; until: Date | null; resumeOn: Date }             // the account's own "pause for a month"
  | { kind: "trialEnding"; billing: Billing; amount: number; chargeAt: Date }
  | { kind: "checkoutHelp"; billing: Billing };

export interface Deps {
  notify?: (uid: string, n: Notice) => Promise<unknown>;
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
  // Nothing paid yet (still on the free day, or its first charge didn't go through): Razorpay already shows the first
  // billing cycle (current_end a month away), but Pro lasts only as long as the free day, never the unpaid month.
  const freeDayEnd = sub.start_at ? sub.start_at + TRIAL_BUFFER_S : null;
  if (paid === 0 && ["active", "pending", "halted", "paused"].includes(s)) {
    const status = s === "active" ? "trial" : s === "pending" ? "past_due" : s;
    return { ...base, status, proUntil: at(end && freeDayEnd ? Math.min(freeDayEnd, end) : freeDayEnd) };
  }
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
    trialUsed: prev.trialUsed === true || a.trialUsed, everPaid: prev.everPaid === true || Number(sub.paid_count || 0) > 0, checked: new Date(deps.now()), updated: new Date(deps.now()), ...extra,
  };
  if (["cancelled", "ended", "halted"].includes(a.status)) fields.cancelAtEnd = false;
  await deps.store.set(docPath(uid), fields);
  return { ...prev, ...fields };
}

/** The account's Razorpay customer, so the subscription shows who it's for from the start (not "No customer yet").
 *  Kept on the billing doc; Razorpay returns the existing customer for an email it already has. Never blocks checkout. */
async function customer(deps: Deps, user: { uid: string; email: string | null }, prev: Rec | null): Promise<string | null> {
  if (typeof prev?.customerId === "string" && prev.customerId) return prev.customerId;
  if (!user.email) return null;
  try {
    const c = await deps.rzp("POST", "/customers", { name: user.email.split("@")[0].slice(0, 50), email: user.email,
                                                     fail_existing: "0", notes: { uid: user.uid } });
    return typeof c?.id === "string" ? c.id : null;
  } catch { return null; }
}

/** Start a subscription for the website's checkout. */
export type Where = "web" | "app" | "unknown";
const whereOf = (v: unknown): Where => (v === "web" || v === "app" ? v : "unknown");

export async function checkout(deps: Deps, user: { uid: string; email: string | null }, body: any) {
  const billing: Billing = body?.billing === "monthly" ? "monthly" : body?.billing === "yearly" ? "yearly" : (() => {
    throw new BillingError(422, "billing must be monthly or yearly"); })();
  const now = deps.now();
  const prev = await deps.store.get(docPath(user.uid));
  const view = publicView(prev, now);
  if (view.pro && prev?.status !== "created" && prev?.status !== "cancelled") throw new BillingError(409, "You already have CricSynthesis Pro.");
  const trial = view.trialAvailable;
  const customerId = await customer(deps, user, prev);
  const sub = await deps.rzp("POST", "/subscriptions", {
    plan_id: await planId(deps, billing), total_count: CYCLES[billing], quantity: 1, customer_notify: 1,
    ...(customerId ? { customer_id: customerId } : {}),
    ...(trial ? { start_at: Math.floor(now / 1000) + TRIAL_S } : {}),
    notes: { uid: user.uid, product: "pro", billing, where: whereOf(body?.where) },
  });
  // keep any access still running (e.g. a cancelled plan's last days) until the new subscription is confirmed
  await deps.store.set(docPath(user.uid), { product: "pro", subscriptionId: sub.id, rzStatus: sub.status, billing, source: whereOf(body?.where),
                                            ...(customerId ? { customerId } : {}),
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
  const d = await save(deps, uid, sub, { billing: sub.notes?.billing ?? prev?.billing ?? null, cancelAtEnd: false });
  await startedMail(deps, uid, d);
  return publicView(d, deps.now());
}

/** "Pro started", once per subscription (from verify or, if the page closed first, the webhook). */
async function startedMail(deps: Deps, uid: string, d: Rec) {
  if (!deps.notify || d.mailStarted === d.subscriptionId || !["trial", "active"].includes(String(d.status))) return;
  const billing: Billing = d.billing === "yearly" ? "yearly" : "monthly", trial = d.status === "trial";
  const first = ms(trial ? d.trialEnd : d.currentEnd);
  await deps.store.set(docPath(uid), { mailStarted: d.subscriptionId });
  await deps.notify(uid, { kind: "started", billing, amount: PRICE[billing] / 100, trial,
                           firstCharge: new Date(Number.isFinite(first) ? first : deps.now() + TRIAL_S * 1000) });
}

/** Cancel: a paid plan at the end of its period; a free day at once (Pro stays on until the free day ends). */
export const CANCEL_REASONS = ["price", "not-using", "season-over", "not-useful", "technical", "other"] as const;
export async function cancel(deps: Deps, uid: string, body: any = {}) {
  const prev = await deps.store.get(docPath(uid));
  const reason = (CANCEL_REASONS as readonly string[]).includes(body?.reason) ? String(body.reason) : null;
  const survey: Rec = reason || body?.note ? { cancelReason: reason, cancelNote: clip(body?.note, 300), cancelledAt: new Date(deps.now()) } : {};
  const subId = prev?.subscriptionId as string | undefined;
  if (!subId) throw new BillingError(404, "No subscription to cancel");
  const cur = await deps.rzp("GET", `/subscriptions/${encodeURIComponent(subId)}`);
  if (["cancelled", "completed", "expired"].includes(cur.status)) return publicView(await save(deps, uid, cur, survey), deps.now());
  const atEnd = cur.status === "active" && Number(cur.paid_count || 0) > 0;     // nothing paid yet: cancel now, so the first charge never happens
  const sub = await deps.rzp("POST", `/subscriptions/${encodeURIComponent(subId)}/cancel`, { cancel_at_cycle_end: atEnd ? 1 : 0 });
  const d = await save(deps, uid, sub, { ...(atEnd ? { cancelAtEnd: true } : {}), ...survey, pausedByUs: false, resumeOn: null });
  const until = ms(atEnd ? d.currentEnd : d.proUntil);
  if (deps.notify && Number.isFinite(until)) await deps.notify(uid, { kind: "cancelled", until: new Date(until), trial: !atEnd && Number(cur.paid_count || 0) === 0 });
  return publicView(d, deps.now());
}

export const PAUSE_DAYS = 30;
/** "Pause for a month": only a plan that has been paid for. Pro runs to the end of the paid period, nothing is charged
 *  while paused, and billingCron restarts it PAUSE_DAYS after that (the account can restart it sooner). */
export async function pause(deps: Deps, uid: string) {
  const prev = await deps.store.get(docPath(uid));
  const subId = prev?.subscriptionId as string | undefined;
  if (!subId) throw new BillingError(404, "No subscription to pause");
  if (prev?.status !== "active" || !(Number(prev?.paidCount || 0) > 0) || prev?.cancelAtEnd === true) {
    throw new BillingError(409, "Only a paid plan that's renewing can be paused");
  }
  const end = ms(prev.currentEnd);
  const resumeOn = new Date((Number.isFinite(end) ? end : deps.now()) + PAUSE_DAYS * 86400_000);
  // marked first, so the webhook for this pause doesn't send the "autopay paused in your UPI app" email
  await deps.store.set(docPath(uid), { pausedByUs: true, resumeOn });
  let sub: any;
  try { sub = await deps.rzp("POST", `/subscriptions/${encodeURIComponent(subId)}/pause`, { pause_at: "now" }); }
  catch (e) {
    await deps.store.set(docPath(uid), { pausedByUs: false, resumeOn: null });
    console.error("pause", (e as Error).message);
    throw new BillingError(409, "Pausing isn't available for your payment method. You can cancel instead, and subscribe again any time.");
  }
  const d = await save(deps, uid, sub, { pausedByUs: true, resumeOn, pausedAt: new Date(deps.now()) });
  if (deps.notify) {
    const until = ms(d.proUntil);
    await deps.notify(uid, { kind: "pausedByYou", until: Number.isFinite(until) ? new Date(until) : null, resumeOn });
  }
  return publicView(d, deps.now());
}

/** Restart a plan paused with "pause for a month" (the account, or billingCron when the month is up). */
export async function resume(deps: Deps, uid: string) {
  const prev = await deps.store.get(docPath(uid));
  const subId = prev?.subscriptionId as string | undefined;
  if (!subId || prev?.status !== "paused") throw new BillingError(409, "Your plan isn't paused");
  const sub = await deps.rzp("POST", `/subscriptions/${encodeURIComponent(subId)}/resume`, { resume_at: "now" });
  return publicView(await save(deps, uid, sub, { pausedByUs: false, resumeOn: null }), deps.now());
}

export const REMIND_BEFORE_MS = 8 * 3600_000;        // free day ending: sent in the last 8 hours (the cron runs every 3)
const HELP_AFTER_MS = 2 * 3600_000, HELP_UNTIL_MS = 48 * 3600_000;
const CRON_MAX = 15;                                   // emails or Razorpay calls per run (the free plan allows 50 subrequests)
/** The scheduled jobs over every account's billing doc (users/{uid}/billing/pro, with `uid`). Each email goes once
 *  (recorded on the doc). Returns what it did, for the log. */
export async function billingCron(deps: Deps, docs: (Rec & { uid: string })[]) {
  const now = deps.now(), done: string[] = [];
  for (const d of docs) {
    if (done.length >= CRON_MAX) break;
    const uid = d.uid, subId = String(d.subscriptionId || "");
    if (!subId) continue;
    const billing: Billing = d.billing === "yearly" ? "yearly" : "monthly";
    try {
      // a month's pause is up: restart it
      if (d.status === "paused" && d.pausedByUs === true && ms(d.resumeOn) <= now) {
        await resume(deps, uid); done.push(`${uid}: resumed`); continue;
      }
      // the free day ends within 8 hours and the plan is still on
      const trialEnd = ms(d.trialEnd);
      if (d.status === "trial" && d.cancelAtEnd !== true && Number.isFinite(trialEnd) && trialEnd > now
          && trialEnd - now <= REMIND_BEFORE_MS && d.mailTrialEnding !== subId) {
        await deps.store.set(docPath(uid), { mailTrialEnding: subId });
        if (deps.notify) await deps.notify(uid, { kind: "trialEnding", billing, amount: PRICE[billing] / 100, chargeAt: new Date(trialEnd) });
        done.push(`${uid}: free day ending`); continue;
      }
      // started a checkout 2 to 48 hours ago and never finished it
      const started = ms(d.updated);
      if (d.status === "created" && Number.isFinite(started) && now - started >= HELP_AFTER_MS && now - started <= HELP_UNTIL_MS
          && d.mailCheckoutHelp !== subId) {
        await deps.store.set(docPath(uid), { mailCheckoutHelp: subId });
        if (deps.notify) await deps.notify(uid, { kind: "checkoutHelp", billing });
        done.push(`${uid}: checkout help`);
      }
    } catch (e) { console.error("billing cron", uid, (e as Error).message); }
  }
  return done;
}

/** Read the subscription from Razorpay again and re-save the account's access (scripts/resync-billing.ts). */
export async function resync(deps: Deps, uid: string) {
  const d = await deps.store.get(docPath(uid));
  if (!d?.subscriptionId) return null;
  const before = { status: d.status, proUntil: d.proUntil };
  const after = await save(deps, uid, await deps.rzp("GET", `/subscriptions/${encodeURIComponent(String(d.subscriptionId))}`));
  return { before, after: { status: after.status, proUntil: after.proUntil } };
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

// ── payment attempts that didn't go through, for the console (paymentEvents/{uid}_{day}: at most 30 a day per account)
const ATTEMPT_KINDS = ["failed", "error", "closed", "renewal failed", "halted"] as const;
export type AttemptKind = typeof ATTEMPT_KINDS[number];
const clip = (v: unknown, n = 160) => (typeof v === "string" ? v.slice(0, n) : v == null ? null : String(v).slice(0, n));
/** The device family from a browser's User-Agent: enough to tell Android, iPhone and desktop apart. */
export const deviceOf = (ua: string | null) => !ua ? "unknown" : /android/i.test(ua) ? "android" : /iphone|ipad|ios/i.test(ua) ? "ios" : "desktop";

export async function logAttempt(deps: Deps, uid: string, e: Rec) {
  const now = new Date(deps.now()), day = now.toISOString().slice(0, 10);
  const path = `paymentEvents/${uid}_${day}`;
  const doc = await deps.store.get(path);
  const events = Array.isArray(doc?.events) ? (doc!.events as Rec[]) : [];
  if (events.length >= 30) return { ok: true, capped: true };
  await deps.store.set(path, { uid, day, updated: now, events: [...events, { ...e, at: now.toISOString() }] });
  return { ok: true };
}

/** What the checkout page reports: Razorpay's error (code, reason, step, source) with where it happened. No card or
 *  UPI details are ever sent: Razorpay doesn't give them to the page. */
export async function attempt(deps: Deps, uid: string, body: any, ua: string | null) {
  const kind = String(body?.kind || "");
  if (!["failed", "error", "closed"].includes(kind)) throw new BillingError(422, "kind must be failed, error or closed");
  const d = await deps.store.get(docPath(uid));
  return logAttempt(deps, uid, {
    kind, where: whereOf(body?.where), device: deviceOf(ua), billing: body?.billing === "yearly" ? "yearly" : "monthly",
    code: clip(body?.code, 60), reason: clip(body?.reason, 80), description: clip(body?.description), step: clip(body?.step, 60),
    source: clip(body?.source, 40), paymentId: clip(body?.paymentId, 40), subscriptionId: clip(d?.subscriptionId, 40),
    trial: !d?.trialUsed,
  });
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
  const resumed = sub.status === "active" && prev.pausedByUs === true;
  const d = await save(deps, uid, sub, { billing: sub.notes?.billing ?? prev?.billing ?? null, ...(resumed ? { pausedByUs: false, resumeOn: null } : {}) });
  await startedMail(deps, uid, d);
  const first = Number(d.paidCount || 0) === 0;
  // autopay paused from the customer's UPI app or bank (not our own "pause for a month"): once per pause
  if (deps.notify && d.status === "paused" && prev.status !== "paused" && prev.pausedByUs !== true) {
    const until = ms(d.proUntil);
    await deps.notify(uid, { kind: "paused", until: Number.isFinite(until) ? new Date(until) : null });
  }
  // a renewal that failed, or retries that ran out: logged once per change, with where the subscription started
  if ((d.status === "past_due" || d.status === "halted") && prev.status !== d.status) {
    await logAttempt(deps, uid, { kind: d.status === "past_due" ? "renewal failed" : "halted", where: whereOf(prev.source ?? sub.notes?.where),
                                  device: "unknown", billing: d.billing ?? null, subscriptionId: sub.id, code: null, reason: null,
                                  description: null, step: first ? "first charge" : "renewal", source: null, paymentId: null, trial: first });
  }
  // a renewal that didn't go through: once per billing period
  const period = d.currentEnd instanceof Date ? d.currentEnd.toISOString() : String(d.currentEnd ?? "");
  if (deps.notify && d.status === "past_due" && prev.mailFailed !== period) {
    const billing: Billing = d.billing === "yearly" ? "yearly" : "monthly", grace = ms(d.proUntil);
    await deps.store.set(docPath(uid), { mailFailed: period });
    await deps.notify(uid, { kind: "failed", billing, amount: PRICE[billing] / 100, first,
                             graceUntil: new Date(Number.isFinite(grace) ? grace : deps.now() + GRACE_S * 1000) });
  }
  return { ok: true };
}
