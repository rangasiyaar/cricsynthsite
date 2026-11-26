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

// Recent subscriptions (read-only): status, plan, dates and payment method, to explain an odd status on the console.
// Prints no names, emails or phone numbers: the account id is cut to 6 characters.
try {
  const subs = await rzp("GET", "/subscriptions?count=15");
  const t = (s: number | null | undefined) => (s ? new Date(s * 1000).toISOString().replace("T", " ").slice(0, 16) + " UTC" : "–");
  console.log(`\nRecent subscriptions (${(subs.items || []).length}):`);
  for (const s of subs.items || []) {
    console.log(`- ${s.id}: ${s.status} · plan ${s.plan_id} · created ${t(s.created_at)} · starts ${t(s.start_at)} · paid ${s.paid_count}/${s.total_count}`
      + ` · method ${s.payment_method || "–"} · auth attempts ${s.auth_attempts ?? "–"} · current end ${t(s.current_end)} · ended ${t(s.ended_at)}`
      + ` · where ${s.notes?.where || "–"} · account ${String(s.notes?.uid || "–").slice(0, 6)}…`);
    if (s.status === "paused" || s.status === "halted" || s.status === "pending") {
      const inv = await rzp("GET", `/invoices?subscription_id=${s.id}`).catch(() => null);
      for (const i of inv?.items || []) console.log(`    invoice ${i.id}: ${i.status} · ₹${(i.amount ?? 0) / 100} · ${t(i.created_at)} · payment ${i.payment_id || "–"}`);
    }
  }
} catch (e) { console.log(`Couldn't list subscriptions: ${(e as Error).message}`); }
