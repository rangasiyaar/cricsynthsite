// One-off: every account back to "not subscribed" (run by .github/workflows/billing-reset.yml).
//  1. Each CricSynthesis Pro billing record (users/{uid}/billing/pro): cancel its Razorpay subscription at once, then
//     delete the record (so the account also gets its free day again).
//  2. Each account with a `plan` custom claim: remove the claim (needs the Firebase Authentication Admin role).
// Dry run unless APPLY=1. Refuses live Razorpay keys unless ALLOW_LIVE=1. Everything done is written to adminLog.
import { razorpay } from "../../edge/src/billing.ts";
import { Google } from "../src/gcp.ts";

const env = process.env;
const apply = env.APPLY === "1";
if (!env.GOOGLE_SA || !env.RZP_ID || !env.RZP_SECRET) throw new Error("Needs GOOGLE_SA, RZP_ID and RZP_SECRET");
if (env.RZP_ID.startsWith("rzp_live_") && env.ALLOW_LIVE !== "1") throw new Error("Live Razorpay keys: refusing (set ALLOW_LIVE=1)");
const g = new Google(env.GOOGLE_SA);
const rzp = razorpay(env.RZP_ID, env.RZP_SECRET);
const log: string[] = [];
const say = (s: string) => { log.push(s); console.log(s); };

say(`${apply ? "APPLYING" : "DRY RUN"} · Razorpay ${env.RZP_ID.startsWith("rzp_live_") ? "LIVE" : "test"} keys`);
const bills = await g.group("billing");
say(`Billing records: ${bills.length}`);
for (const b of bills) {
  const uid = b._path.split("/")[1];
  const sub = typeof b.subscriptionId === "string" ? b.subscriptionId : "";
  let rzStatus = "none";
  if (sub) {
    try { rzStatus = (await rzp("GET", `/subscriptions/${sub}`)).status; } catch (e) { rzStatus = `unreadable (${(e as Error).message})`; }
  }
  const live = ["created", "authenticated", "active", "pending", "halted", "paused"].includes(rzStatus);
  say(`- ${uid}: ${b.status ?? "?"} · ${sub || "no subscription"} (${rzStatus})${live ? " → cancel" : ""} → delete record`);
  if (!apply) continue;
  if (live) {
    try { await rzp("POST", `/subscriptions/${sub}/cancel`, { cancel_at_cycle_end: 0 }); }
    catch (e) { say(`  cancel failed: ${(e as Error).message}`); }
  }
  await g.remove(b._path);
}

// 1b. Every other subscription on the Razorpay account (throwaway checks, abandoned checkouts): cancel the open ones.
//     Razorpay can't delete subscriptions; cancelled ones stay listed in its dashboard as history.
const open = ["created", "authenticated", "active", "pending", "halted", "paused"];
let all: any[] = [];
for (let skip = 0; skip < 2000; skip += 100) {
  const page = await rzp("GET", `/subscriptions?count=100&skip=${skip}`);
  all = all.concat(page.items || []);
  if ((page.items || []).length < 100) break;
}
const toCancel = all.filter((x) => open.includes(x.status));
say(`Razorpay subscriptions: ${all.length} · still open: ${toCancel.length}`);
for (const x of toCancel) {
  say(`- ${x.id}: ${x.status} (${x.notes?.product ?? "?"}${x.notes?.uid ? ` · ${x.notes.uid}` : ""}) → cancel`);
  if (!apply) continue;
  try { await rzp("POST", `/subscriptions/${x.id}/cancel`, { cancel_at_cycle_end: 0 }); }
  catch (e) { say(`  cancel failed: ${(e as Error).message}`); }
}

const users = await g.users();
const claimed = users.filter((u) => u.claims && "plan" in u.claims);
say(`Accounts: ${users.length} · with an assigned plan: ${claimed.length}`);
for (const u of claimed) {
  say(`- ${u.uid}: plan=${u.claims.plan} → remove`);
  if (!apply) continue;
  const { plan: _drop, ...rest } = u.claims;
  try { await g.updateUser(u.uid, { claims: rest }); }
  catch (e) { say(`  failed: ${(e as Error).message} (grant the service account the Firebase Authentication Admin role)`); }
}

if (apply) {
  const now = new Date();
  await g.put(`adminLog/${now.getTime()}-billing.reset`, { at: now.toISOString(), email: "workflow", what: "billing.reset", uid: "*",
    done: `Reset ${bills.length} billing record(s) and ${claimed.length} assigned plan(s)`, detail: JSON.stringify(log).slice(0, 9000) });
}
say("Done.");
