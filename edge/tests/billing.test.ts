// CricSynthesis Pro billing (src/billing.ts) against a fake Razorpay and an in-memory store.
import assert from "node:assert/strict";
import { test } from "node:test";
import * as B from "../src/billing.ts";

const T0 = Date.UTC(2026, 10, 18, 12) ;      // ms
const S0 = T0 / 1000;

function world() {
  const docs = new Map<string, B.Rec>();
  const subs = new Map<string, any>();
  const calls: string[] = [];
  let n = 0, clock = T0;
  const deps: B.Deps = {
    keyId: "rzp_test_x", keySecret: "sek", webhookSecret: "whs",
    now: () => clock,
    store: {
      get: async (p) => (docs.has(p) ? { ...docs.get(p)! } : null),
      set: async (p, f) => {
        const plain = Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v instanceof Date ? v.toISOString() : v]));
        docs.set(p, { ...(docs.get(p) || {}), ...plain });
      },
    },
    rzp: async (method, path, body: any) => {
      calls.push(`${method} ${path}`);
      if (method === "POST" && path === "/plans") return { id: `plan_${++n}` };
      if (method === "POST" && path === "/customers") return { id: `cust_${body.email}` };
      if (method === "POST" && path === "/subscriptions") {
        const s = { id: `sub_${++n}`, status: "created", paid_count: 0, start_at: body.start_at ?? null, current_end: null, notes: body.notes,
                    customer_id: body.customer_id ?? null };
        subs.set(s.id, s);
        return s;
      }
      const m = path.match(/^\/subscriptions\/([^/]+)(\/cancel|\/pause|\/resume)?$/);
      if (m && method === "GET") return subs.get(m[1]);
      if (m && m[2] === "/pause") { const s = subs.get(m[1]); if (s.noPause) throw new Error("400 pause not supported"); s.status = "paused"; return s; }
      if (m && m[2] === "/resume") { const s = subs.get(m[1]); s.status = "active"; return s; }
      if (m && m[2]) {
        const s = subs.get(m[1]);
        if (!body.cancel_at_cycle_end) s.status = "cancelled";
        return s;
      }
      throw new Error("unexpected " + method + " " + path);
    },
  };
  return { deps, docs, subs, calls, tick: (s: number) => { clock += s * 1000; } };
}

const user = { uid: "u1", email: "fan@example.com" };
const doc = "users/u1/billing/pro";

test("first checkout gets a free day, creates the plan once, and reuses it", async () => {
  const w = world();
  const r = await B.checkout(w.deps, user, { billing: "monthly" });
  assert.equal(r.trial, true);
  assert.equal(r.amount, 34_900);
  assert.equal(w.subs.get(r.subscription_id).start_at, S0 + B.TRIAL_S);
  assert.equal(w.docs.get(doc)!.status, "created");
  assert.equal(w.subs.get(r.subscription_id).customer_id, "cust_fan@example.com");   // shows who it's for at Razorpay
  assert.equal(w.docs.get(doc)!.customerId, "cust_fan@example.com");
  const again = await B.checkout(w.deps, user, { billing: "monthly" });   // abandoned first checkout: a new one, same plan
  assert.equal(w.calls.filter((c) => c === "POST /plans").length, 1);
  assert.equal(w.calls.filter((c) => c === "POST /customers").length, 1);  // the customer is kept and reused
  assert.equal(w.subs.get(again.subscription_id).customer_id, "cust_fan@example.com");
  await assert.rejects(B.checkout(w.deps, user, { billing: "weekly" }), /monthly or yearly/);
});

test("verify checks the signature, then Pro runs through the free day", async () => {
  const w = world();
  const r = await B.checkout(w.deps, user, { billing: "yearly" });
  w.subs.get(r.subscription_id).status = "authenticated";
  await assert.rejects(B.verify(w.deps, "u1", { razorpay_payment_id: "pay_1", razorpay_subscription_id: r.subscription_id, razorpay_signature: "00" }),
                       /could not be verified/);
  const sig = await B.hmacHex("sek", `pay_1|${r.subscription_id}`);
  const v = await B.verify(w.deps, "u1", { razorpay_payment_id: "pay_1", razorpay_subscription_id: r.subscription_id, razorpay_signature: sig });
  assert.equal(v.pro, true);
  assert.equal(v.status, "trial");
  assert.equal(v.trialAvailable, false);
  assert.equal(v.billing, "yearly");
  // someone else can't claim this payment
  await assert.rejects(B.verify(w.deps, "u2", { razorpay_payment_id: "pay_1", razorpay_subscription_id: r.subscription_id, razorpay_signature: sig }),
                       /different checkout/);
});

test("access rules: active gets 3 days' grace, halted none, a cancelled free day keeps Pro until it ends", () => {
  const end = S0 + 30 * 86400;
  assert.equal(B.accessFrom({ status: "active", paid_count: 1, current_end: end }).proUntil!.getTime(), (end + 3 * 86400) * 1000);
  assert.equal(B.accessFrom({ status: "pending", paid_count: 1, current_end: end }).status, "past_due");
  assert.equal(B.accessFrom({ status: "halted", paid_count: 1, current_end: end }).proUntil!.getTime(), end * 1000);
  const c = B.accessFrom({ status: "cancelled", paid_count: 0, start_at: S0 + 86400 });
  assert.equal(c.proUntil!.getTime(), (S0 + 86400) * 1000);
  assert.equal(B.accessFrom({ status: "created" }).proUntil, null);
  assert.equal(B.accessFrom({ status: "created" }).trialUsed, false);
});

test("no second free day, and no second subscription while Pro is on", async () => {
  const w = world();
  const r = await B.checkout(w.deps, user, { billing: "monthly" });
  w.subs.get(r.subscription_id).status = "authenticated";
  const sig = await B.hmacHex("sek", `pay_1|${r.subscription_id}`);
  await B.verify(w.deps, "u1", { razorpay_payment_id: "pay_1", razorpay_subscription_id: r.subscription_id, razorpay_signature: sig });
  await assert.rejects(B.checkout(w.deps, user, { billing: "monthly" }), /already have/);
  // cancel the free day: Pro stays on until it ends, then a new checkout has no free day
  const c = await B.cancel(w.deps, "u1");
  assert.equal(c.status, "cancelled");
  assert.equal(c.pro, true);
  w.tick(2 * 86400);
  const again = await B.checkout(w.deps, user, { billing: "monthly" });
  assert.equal(again.trial, false);
  assert.equal(w.subs.get(again.subscription_id).start_at, null);
});

test("nothing paid yet: Pro lasts only the free day, whatever Razorpay's first cycle says", () => {
  const start = S0 + 86400, end = S0 + 31 * 86400, six = 6 * 3600;
  for (const [rz, ours] of [["active", "trial"], ["pending", "past_due"], ["halted", "halted"], ["paused", "paused"]]) {
    const a = B.accessFrom({ status: rz, paid_count: 0, start_at: start, current_end: end });
    assert.equal(a.status, ours, rz);
    assert.equal(a.proUntil!.getTime(), (start + six) * 1000, rz);
  }
  // once the first charge is in, the paid month counts as before
  assert.equal(B.accessFrom({ status: "paused", paid_count: 1, start_at: start, current_end: end }).proUntil!.getTime(), end * 1000);
  assert.equal(B.accessFrom({ status: "active", paid_count: 1, start_at: start, current_end: end }).status, "active");
});

test("cancelling a paid plan waits for the end of the period", async () => {
  const w = world();
  const r = await B.checkout(w.deps, user, { billing: "monthly" });
  Object.assign(w.subs.get(r.subscription_id), { status: "active", paid_count: 1, current_end: S0 + 30 * 86400 });
  const sig = await B.hmacHex("sek", `pay_1|${r.subscription_id}`);
  await B.verify(w.deps, "u1", { razorpay_payment_id: "pay_1", razorpay_subscription_id: r.subscription_id, razorpay_signature: sig });
  const c = await B.cancel(w.deps, "u1");
  assert.equal(c.cancelAtEnd, true);
  assert.equal(c.status, "active");
  assert.ok(w.calls.includes(`POST /subscriptions/${r.subscription_id}/cancel`));
});

test("webhook: signed events update the right account; bad signatures and old checkouts are refused or ignored", async () => {
  const w = world();
  const r = await B.checkout(w.deps, user, { billing: "monthly" });
  const ev = (sub: any) => JSON.stringify({ event: "subscription.charged", payload: { subscription: { entity: sub } } });
  const sub = { id: r.subscription_id, status: "active", paid_count: 1, current_end: S0 + 30 * 86400, notes: { uid: "u1", product: "pro", billing: "monthly" } };
  await assert.rejects(B.webhook(w.deps, ev(sub), "bad"), /Bad signature/);
  const raw = ev(sub);
  assert.deepEqual(await B.webhook(w.deps, raw, await B.hmacHex("whs", raw)), { ok: true });
  assert.equal(w.docs.get(doc)!.status, "active");
  const old = ev({ ...sub, id: "sub_old", status: "cancelled" });
  assert.equal((await B.webhook(w.deps, old, await B.hmacHex("whs", old))).ignored, true);
  assert.equal(w.docs.get(doc)!.status, "active");
  // a reset account (record deleted): a late event doesn't recreate the plan
  w.docs.delete(doc);
  const late = ev({ ...sub, status: "cancelled", paid_count: 0, start_at: S0 + 86400 });
  assert.equal((await B.webhook(w.deps, late, await B.hmacHex("whs", late))).ignored, true);
  assert.equal(w.docs.has(doc), false);
  const noSecret = { ...w.deps, webhookSecret: undefined };
  await assert.rejects(B.webhook(noSecret, raw, "x"), /not configured/);
});

test("status refreshes a stale record from Razorpay", async () => {
  const w = world();
  const r = await B.checkout(w.deps, user, { billing: "monthly" });
  Object.assign(w.subs.get(r.subscription_id), { status: "active", paid_count: 1, current_end: S0 + 30 * 86400 });
  const sig = await B.hmacHex("sek", `pay_1|${r.subscription_id}`);
  await B.verify(w.deps, "u1", { razorpay_payment_id: "pay_1", razorpay_subscription_id: r.subscription_id, razorpay_signature: sig });
  w.subs.get(r.subscription_id).status = "halted";
  assert.equal((await B.status(w.deps, "u1")).status, "active");      // fresh: no call
  w.tick(3600);
  assert.equal((await B.status(w.deps, "u1")).status, "halted");
  assert.deepEqual(await B.status(w.deps, "nobody"), { status: "none", pro: false, trialAvailable: true });
});

test("account emails: Pro started once per subscription, cancelled, and a failed renewal once per period", async () => {
  const w = world();
  const sent: B.Notice[] = [];
  w.deps.notify = async (_uid, n) => { sent.push(n); };
  const r = await B.checkout(w.deps, user, { billing: "monthly" });
  w.subs.get(r.subscription_id).status = "authenticated";
  const sig = await B.hmacHex("sek", `pay_1|${r.subscription_id}`);
  const body = { razorpay_payment_id: "pay_1", razorpay_subscription_id: r.subscription_id, razorpay_signature: sig };
  await B.verify(w.deps, "u1", body);
  await B.verify(w.deps, "u1", body);                                  // a repeat doesn't send it again
  assert.deepEqual(sent.map((n) => n.kind), ["started"]);
  assert.equal((sent[0] as any).trial, true);
  assert.equal((sent[0] as any).amount, 349);
  assert.equal((sent[0] as any).firstCharge.getTime(), (S0 + B.TRIAL_S) * 1000);
  // the renewal fails: one email for the period, even if Razorpay sends the event twice
  const sub = { id: r.subscription_id, status: "pending", paid_count: 1, current_end: S0 + 30 * 86400, notes: { uid: "u1", product: "pro", billing: "monthly" } };
  const raw = JSON.stringify({ event: "subscription.pending", payload: { subscription: { entity: sub } } });
  await B.webhook(w.deps, raw, await B.hmacHex("whs", raw));
  await B.webhook(w.deps, raw, await B.hmacHex("whs", raw));
  assert.deepEqual(sent.map((n) => n.kind), ["started", "failed"]);
  assert.equal((sent[1] as any).graceUntil.getTime(), (S0 + 33 * 86400) * 1000);
  // cancelling: the email says until when
  Object.assign(w.subs.get(r.subscription_id), { status: "active", paid_count: 1, current_end: S0 + 30 * 86400 });
  await B.cancel(w.deps, "u1");
  assert.equal(sent.at(-1)!.kind, "cancelled");
  assert.equal((sent.at(-1) as any).until.getTime(), (S0 + 30 * 86400) * 1000);
  assert.equal((sent.at(-1) as any).trial, false);
});

test("checkout records where it started (website or app) on the account and at Razorpay", async () => {
  const w = world();
  const r = await B.checkout(w.deps, user, { billing: "monthly", where: "app" });
  assert.equal(w.docs.get(doc)!.source, "app");
  assert.equal(w.subs.get(r.subscription_id).notes.where, "app");
  await B.checkout(w.deps, user, { billing: "monthly" });                    // an older page that doesn't say
  assert.equal(w.docs.get(doc)!.source, "unknown");
  await B.checkout(w.deps, user, { billing: "monthly", where: "evil" });
  assert.equal(w.docs.get(doc)!.source, "unknown");
});

test("failed payments are logged with website or app and the device, capped per account per day", async () => {
  const w = world();
  await B.checkout(w.deps, user, { billing: "yearly", where: "app" });
  const ua = "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36";
  await B.attempt(w.deps, "u1", { kind: "failed", where: "app", billing: "yearly", code: "BAD_REQUEST_ERROR",
    reason: "payment_failed", description: "Your payment was declined by the bank.", step: "payment_authorization",
    source: "bank", paymentId: "pay_1" }, ua);
  await B.attempt(w.deps, "u1", { kind: "closed", where: "web" }, "Mozilla/5.0 (Windows NT 10.0)");
  const day = w.docs.get("paymentEvents/u1_2026-11-18")!;
  const ev = day.events as B.Rec[];
  assert.equal(day.uid, "u1");
  assert.equal(ev.length, 2);
  assert.deepEqual([ev[0].kind, ev[0].where, ev[0].device, ev[0].billing, ev[0].reason, ev[0].source],
                   ["failed", "app", "android", "yearly", "payment_failed", "bank"]);
  assert.equal(ev[0].subscriptionId, w.docs.get(doc)!.subscriptionId);
  assert.deepEqual([ev[1].kind, ev[1].where, ev[1].device], ["closed", "web", "desktop"]);
  await assert.rejects(B.attempt(w.deps, "u1", { kind: "hacked" }, null), /kind must be/);
  const long = "x".repeat(5000);
  for (let k = 0; k < 40; k++) await B.attempt(w.deps, "u1", { kind: "error", where: "web", description: long }, null);
  const after = w.docs.get("paymentEvents/u1_2026-11-18")!.events as B.Rec[];
  assert.equal(after.length, 30);                                          // capped
  assert.equal((after[2].description as string).length, 160);              // text kept short
});

test("a failed renewal is logged once, with where the subscription started", async () => {
  const w = world();
  const r = await B.checkout(w.deps, user, { billing: "monthly", where: "web" });
  const ev = (sub: any) => JSON.stringify({ event: "subscription.pending", payload: { subscription: { entity: sub } } });
  const sub = { id: r.subscription_id, status: "pending", paid_count: 1, current_end: S0 + 30 * 86400, notes: { uid: "u1", product: "pro", billing: "monthly", where: "web" } };
  const raw = ev(sub);
  await B.webhook(w.deps, raw, await B.hmacHex("whs", raw));
  await B.webhook(w.deps, raw, await B.hmacHex("whs", raw));                // the same event again: not logged twice
  const halted = ev({ ...sub, status: "halted" });
  await B.webhook(w.deps, halted, await B.hmacHex("whs", halted));
  const events = w.docs.get("paymentEvents/u1_2026-11-18")!.events as B.Rec[];
  assert.deepEqual(events.map((e) => [e.kind, e.where]), [["renewal failed", "web"], ["halted", "web"]]);
});

// ── keeping customers: paused autopay, first-charge failures, reminders, unfinished checkouts, exit survey, pause ──
const hook = async (w: ReturnType<typeof world>, sub: any) => {
  const raw = JSON.stringify({ event: "subscription.updated", payload: { subscription: { entity: { ...sub } } } });
  return B.webhook(w.deps, raw, await B.hmacHex("whs", raw));
};
async function paying(w: ReturnType<typeof world>, paid = 1) {
  const r = await B.checkout(w.deps, user, { billing: "monthly" });
  const s = w.subs.get(r.subscription_id);
  Object.assign(s, { status: "active", paid_count: paid, start_at: S0 + 86400, current_end: S0 + 31 * 86400 });
  await hook(w, s);
  return s;
}

test("autopay paused in the UPI app: one email; our own pause doesn't send it", async () => {
  const w = world(), sent: B.Notice[] = [];
  w.deps.notify = async (_u, n) => { sent.push(n); };
  const s = await paying(w);
  sent.length = 0;
  s.status = "paused";
  await hook(w, s);
  await hook(w, s);                                   // a repeated event: no second email
  assert.deepEqual(sent.map((n) => n.kind), ["paused"]);
  // resumed in the UPI app, then paused with our own "pause for a month": the pause confirmation only
  s.status = "active"; await hook(w, s);
  sent.length = 0;
  const v = await B.pause(w.deps, "u1");
  assert.equal(v.status, "paused");
  await hook(w, s);                                   // Razorpay's webhook for that pause
  assert.deepEqual(sent.map((n) => n.kind), ["pausedByYou"]);
  const d = w.docs.get(doc)!;
  assert.equal(d.pausedByUs, true);
  assert.equal(Date.parse(String(d.resumeOn)), (S0 + 31 * 86400) * 1000 + B.PAUSE_DAYS * 86400_000);
  assert.equal(Date.parse(String(d.proUntil)), (S0 + 31 * 86400) * 1000);   // keeps the month already paid for
});

test("pause: only a paid, renewing plan; a refusal from Razorpay undoes the mark", async () => {
  const w = world();
  const s = await paying(w, 0);                       // free day (nothing paid yet)
  await assert.rejects(B.pause(w.deps, "u1"), /paid plan/);
  s.paid_count = 1; s.noPause = true; await hook(w, s);
  await assert.rejects(B.pause(w.deps, "u1"), /isn't available/);
  assert.equal(w.docs.get(doc)!.pausedByUs, false);
  assert.equal(w.docs.get(doc)!.status, "active");
});

test("first charge failed: the first-payment email, logged as a first charge", async () => {
  const w = world(), sent: B.Notice[] = [];
  w.deps.notify = async (_u, n) => { sent.push(n); };
  const s = await paying(w, 0);
  sent.length = 0;
  s.status = "pending"; await hook(w, s);
  assert.equal(sent[0].kind, "failed");
  assert.equal((sent[0] as any).first, true);
  const day = w.docs.get(`paymentEvents/u1_${new Date(T0).toISOString().slice(0, 10)}`)!;
  assert.equal((day.events as B.Rec[]).at(-1)!.step, "first charge");
});

test("cron: free-day reminder once, unfinished-checkout email once, a month's pause restarts", async () => {
  const w = world(), sent: [string, B.Notice][] = [];
  w.deps.notify = async (u, n) => { sent.push([u, n]); };
  const docs = () => [...w.docs.entries()].filter(([p]) => p.endsWith("/billing/pro")).map(([p, d]) => ({ ...d, uid: p.split("/")[1] }));
  // a free day ending in 5 hours
  const r = await B.checkout(w.deps, user, { billing: "monthly" });
  const s = w.subs.get(r.subscription_id);
  Object.assign(s, { status: "authenticated", start_at: S0 + 5 * 3600 }); await hook(w, s);
  sent.length = 0;
  assert.deepEqual(await B.billingCron(w.deps, docs()), ["u1: free day ending"]);
  assert.deepEqual(await B.billingCron(w.deps, docs()), []);
  assert.equal(sent[0][1].kind, "trialEnding");
  assert.equal((sent[0][1] as any).chargeAt.getTime(), (S0 + 5 * 3600) * 1000);
  // someone else started a checkout and left: nothing for 2 hours, then one email
  await B.checkout(w.deps, { uid: "u2", email: "b@example.com" }, { billing: "yearly" });
  w.tick(3600);
  assert.ok(!(await B.billingCron(w.deps, docs())).includes("u2: checkout help"));
  w.tick(2 * 3600);
  assert.ok((await B.billingCron(w.deps, docs())).includes("u2: checkout help"));
  assert.ok(!(await B.billingCron(w.deps, docs())).includes("u2: checkout help"));
  assert.equal(sent.find(([u]) => u === "u2")![1].kind, "checkoutHelp");
  // a paused plan restarts when its month is up
  Object.assign(s, { status: "active", paid_count: 1, current_end: S0 + 31 * 86400 }); await hook(w, s);
  await B.pause(w.deps, "u1");
  assert.ok(!(await B.billingCron(w.deps, docs())).includes("u1: resumed"));
  w.tick(62 * 86400);
  assert.ok((await B.billingCron(w.deps, docs())).includes("u1: resumed"));
  assert.equal(w.docs.get(doc)!.status, "active");
  assert.equal(w.docs.get(doc)!.pausedByUs, false);
});

test("cancel records the exit survey answer", async () => {
  const w = world();
  await paying(w);
  await B.cancel(w.deps, "u1", { reason: "season-over", note: "x".repeat(400) });
  const d = w.docs.get(doc)!;
  assert.equal(d.cancelReason, "season-over");
  assert.equal(String(d.cancelNote).length, 300);
  assert.equal(d.cancelAtEnd, true);
  await B.cancel(w.deps, "u1", { reason: "bogus" });
  assert.equal(w.docs.get(doc)!.cancelReason, "season-over");      // an unknown reason doesn't overwrite
});
