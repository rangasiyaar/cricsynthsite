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
      if (method === "POST" && path === "/subscriptions") {
        const s = { id: `sub_${++n}`, status: "created", paid_count: 0, start_at: body.start_at ?? null, current_end: null, notes: body.notes };
        subs.set(s.id, s);
        return s;
      }
      const m = path.match(/^\/subscriptions\/([^/]+)(\/cancel)?$/);
      if (m && method === "GET") return subs.get(m[1]);
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
  await B.checkout(w.deps, user, { billing: "monthly" });           // abandoned first checkout: a new one, same plan
  assert.equal(w.calls.filter((c) => c === "POST /plans").length, 1);
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

test("WELCOME100: ₹100 off the first payment, first subscription only, needs its Razorpay offer", async () => {
  const w = world();
  await assert.rejects(B.checkout(w.deps, user, { billing: "monthly", promo: "welcome100" }), /isn't available/);   // no offer set up
  w.deps.offers = { WELCOME100: "offer_ABCDEFGHIJKLMNOP" };
  assert.deepEqual(await B.promo(w.deps, "u1", { code: " welcome100 ", billing: "monthly" }),
                   { code: "WELCOME100", off: 10_000, label: "₹100 off your first payment", firstCharge: 24_900, billing: "monthly", replacesFreeDay: true });
  await assert.rejects(B.promo(w.deps, "u1", { code: "NOPE" }), /isn't valid/);
  const r = await B.checkout(w.deps, user, { billing: "yearly", promo: "WELCOME100" });
  assert.equal(r.promo!.firstCharge, 366_900);
  assert.equal(r.trial, false);                                   // the code replaces the free day: charged today
  const sent = w.subs.get(r.subscription_id);
  assert.equal(sent.start_at, null);
  assert.equal(sent.notes.promo, "WELCOME100");
  // once the account has paid, the code no longer applies
  Object.assign(sent, { status: "active", paid_count: 1, current_end: S0 + 365 * 86400 });
  const sig = await B.hmacHex("sek", `pay_1|${r.subscription_id}`);
  await B.verify(w.deps, "u1", { razorpay_payment_id: "pay_1", razorpay_subscription_id: r.subscription_id, razorpay_signature: sig });
  await assert.rejects(B.promo(w.deps, "u1", { code: "WELCOME100", billing: "monthly" }), /first subscription only/);
});

test("promo offers follow the key mode: live keys only use the _LIVE offer", async () => {
  const { offersFor } = await import("../src/index.ts");
  const env: any = { RAZORPAY_KEY_ID: "rzp_test_x", RAZORPAY_OFFER_WELCOME100: "offer_TEST", RAZORPAY_OFFER_WELCOME100_LIVE: "offer_LIVE" };
  assert.deepEqual(offersFor(env), { WELCOME100: "offer_TEST" });
  assert.deepEqual(offersFor({ ...env, RAZORPAY_KEY_ID: "rzp_live_x" }), { WELCOME100: "offer_LIVE" });
  assert.deepEqual(offersFor({ ...env, RAZORPAY_KEY_ID: "rzp_live_x", RAZORPAY_OFFER_WELCOME100_LIVE: undefined }), {});   // test id never used live
});
