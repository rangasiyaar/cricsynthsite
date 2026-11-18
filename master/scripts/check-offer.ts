// Test-mode check that a promo's Razorpay offer works: create a throwaway subscription with the offer attached (as our
// checkout does), print what Razorpay says, then cancel it. Run by .github/workflows/billing-check.yml. Refuses live keys.
import { razorpay } from "../../edge/src/billing.ts";
import { Google } from "../src/gcp.ts";

const env = process.env;
if (!env.RZP_ID || !env.RZP_SECRET || !env.GOOGLE_SA) throw new Error("Needs RZP_ID, RZP_SECRET and GOOGLE_SA");
if (env.RZP_ID.startsWith("rzp_live_")) throw new Error("Live keys: this check only runs in test mode");
const rzp = razorpay(env.RZP_ID, env.RZP_SECRET);
const offers: Record<string, string | undefined> = { WELCOME100: env.OFFER_WELCOME100, WELCOME100_CARD: env.OFFER_WELCOME100_CARD };
const cfg = (await new Google(env.GOOGLE_SA).get("billingConfig/razorpay")) || {};
const plans = Object.entries(cfg).filter(([k, v]) => k.startsWith("pro_") && k.endsWith("_test") && typeof v === "string");
console.log(`Plans: ${plans.map(([k, v]) => `${k}=${v}`).join(", ") || "none yet (created at the first checkout)"}`);
for (const [name, id] of Object.entries(offers)) {
  if (!id) { console.log(`${name}: no secret set`); continue; }
  console.log(`${name}: offer ${id.slice(0, 8)}… (${id.length} chars${id.length === 20 ? "" : ", expected 20"})`);
  for (const [k, plan] of plans) {
    try {
      const sub = await rzp("POST", "/subscriptions", { plan_id: plan, total_count: 1, quantity: 1, customer_notify: 0, offer_id: id,
                                                     notes: { product: "check" } });
      console.log(`  ${k}: ACCEPTED · subscription ${sub.id} · status ${sub.status} · offer_id ${sub.offer_id ?? "(not echoed)"}`);
      await rzp("POST", `/subscriptions/${sub.id}/cancel`, { cancel_at_cycle_end: 0 }).catch((e) => console.log(`  (cancel: ${e.message})`));
    } catch (e) { console.log(`  ${k}: REFUSED · ${(e as Error).message}`); }
  }
}
