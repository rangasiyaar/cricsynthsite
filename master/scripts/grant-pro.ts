// Give an account CricSynthesis Pro without a payment (reviewers, partners, comps), for N days: writes the same billing
// record a paid plan has (users/{uid}/billing/pro, status "comp"). Run by .github/workflows/grant-pro.yml; logged to adminLog.
import { Firestore } from "../../edge/src/google.ts";

const env = process.env;
const uid = (env.UID || "").trim(), days = Number(env.DAYS || 90);
if (!env.GOOGLE_SA || !/^[A-Za-z0-9_-]{1,128}$/.test(uid) || !(days >= 0 && days <= 400)) throw new Error("Needs GOOGLE_SA, a uid and 0–400 days");
const fs = new Firestore(env.GOOGLE_SA);
const now = new Date(), until = new Date(now.getTime() + days * 86400_000);
const prev = await fs.getDoc(`users/${uid}/billing/pro`);
if (prev?.subscriptionId && prev.status !== "comp") throw new Error(`This account has a Razorpay subscription (${prev.status}); not overwriting it`);
await fs.setFields(`users/${uid}/billing/pro`, { product: "pro", status: days ? "comp" : "ended", proUntil: until, billing: null,
                                               trialUsed: true, cancelAtEnd: false, updated: now });
await fs.setFields(`adminLog/${now.getTime()}-billing.comp`, { at: now.toISOString(), email: "workflow", what: "billing.comp", uid,
                                                             done: days ? `CricSynthesis Pro granted until ${until.toISOString().slice(0, 10)}` : "Granted Pro removed" });
console.log(days ? `Pro granted to ${uid} until ${until.toISOString().slice(0, 10)}` : `Granted Pro removed from ${uid}`);
