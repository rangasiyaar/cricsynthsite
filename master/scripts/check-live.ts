// Read-only check of the Razorpay keys in GitHub secrets (run by .github/workflows/billing-live-check.yml): which mode
// they are, that Razorpay accepts them, the plans on the account, the plan ids we've stored, and whether the webhook
// secret is set. Creates nothing and charges nothing.
import { razorpay } from "../../edge/src/billing.ts";
import { Google } from "../src/gcp.ts";

const env = process.env;
if (!env.RZP_ID || !env.RZP_SECRET) throw new Error("Needs RZP_ID and RZP_SECRET");
const mode = env.RZP_ID.startsWith("rzp_live_") ? "LIVE" : env.RZP_ID.startsWith("rzp_test_") ? "test" : "unknown";
console.log(`Keys: ${mode} (${env.RZP_ID.slice(0, 13)}…)`);
const rzp = razorpay(env.RZP_ID, env.RZP_SECRET);
try {
  const plans = await rzp("GET", "/plans?count=100");
  console.log(`Razorpay accepted the keys. Plans on the account: ${plans.count ?? (plans.items || []).length}`);
  for (const p of plans.items || []) console.log(`- ${p.id}: ${p.item?.name} · ₹${(p.item?.amount ?? 0) / 100} every ${p.interval} ${p.period}`);
} catch (e) { console.log(`Razorpay REFUSED the keys: ${(e as Error).message}`); process.exitCode = 1; }
console.log(`Webhook secret: ${env.RZP_WEBHOOK ? "set" : "NOT set"}`);
if (env.GOOGLE_SA) {
  const cfg = await new Google(env.GOOGLE_SA).get("billingConfig/razorpay").catch(() => null);
  const stored = Object.entries(cfg || {}).filter(([k]) => !k.startsWith("_"));
  const want = mode === "LIVE" ? "_live" : "_test";
  console.log(`Stored plan ids (${want.slice(1)}): ${stored.filter(([k]) => k.endsWith(want)).map(([k, v]) => `${k}=${v}`).join(", ") || "none yet (created at the first checkout)"}`);
}
