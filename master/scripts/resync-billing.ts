// Re-reads every live Pro subscription from Razorpay and re-saves its access with the current rules (edge/src/billing.ts
// accessFrom), e.g. after a rule change. Run by .github/workflows/billing-resync.yml. Changes only users/{uid}/billing/pro;
// charges, creates and cancels nothing. Prints no names or emails (account ids cut to 6 characters).
import { razorpay, resync, type Deps } from "../../edge/src/billing.ts";
import { Firestore } from "../../edge/src/google.ts";
import { Google } from "../src/gcp.ts";

const env = process.env;
if (!env.RZP_ID || !env.RZP_SECRET || !env.GOOGLE_SA) throw new Error("Needs RZP_ID, RZP_SECRET and GOOGLE_SA");
const fs = new Firestore(env.GOOGLE_SA);
const deps: Deps = { keyId: env.RZP_ID, keySecret: env.RZP_SECRET, rzp: razorpay(env.RZP_ID, env.RZP_SECRET), now: () => Date.now(),
                     store: { get: (p) => fs.getDoc(p), set: (p, f) => fs.setFields(p, f) } };
const docs = (await new Google(env.GOOGLE_SA).group("billing")).filter((d: any) => d._id === "pro" && d.subscriptionId
  && !["created", "ended", "cancelled"].includes(String(d.status)));
const day = (v: unknown) => (v ? new Date(v as string).toISOString().replace("T", " ").slice(0, 16) + " UTC" : "–");
console.log(`Live subscriptions: ${docs.length}`);
for (const d of docs) {
  const uid = String(d._path).split("/")[1];
  const r = await resync(deps, uid).catch((e) => { console.log(`- ${uid.slice(0, 6)}…: failed (${(e as Error).message})`); return null; });
  if (!r) continue;
  const changed = r.before.status !== r.after.status || day(r.before.proUntil) !== day(r.after.proUntil);
  console.log(`- ${uid.slice(0, 6)}… ${d.subscriptionId}: ${r.before.status}, Pro until ${day(r.before.proUntil)} → ${r.after.status}, Pro until ${day(r.after.proUntil)}${changed ? "  (changed)" : ""}`);
}
