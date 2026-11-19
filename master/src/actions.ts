// Admin actions (phase 2). Each is validated, applied with the service account and written to the audit log
// (adminLog/{time}-{type}: who, what, which account, details). Plans live on the keys (users/{uid}/keys/{slot}.plan),
// which the API Worker reads (cached up to a minute); a website plan is the account's `plan` custom claim.
import { PLANS } from "../../edge/src/keys.ts";
import { apiPlanFor, type Tier, TIERS } from "./data.ts";
import type { AuthUser, Google } from "./gcp.ts";

type Row = Record<string, any>;
export class ActionError extends Error { status: number; constructor(m: string, s = 422) { super(m); this.status = s; } }

const UID = /^[A-Za-z0-9_-]{1,128}$/, SLOT = /^k[1-5]$/;
const REQ_PLAN: Record<string, string> = { "api-pro": "pro", "api-business": "business" };
const NOTE_MAX = 500;

export type Action =
  | { type: "request.approve"; uid: string; plan: string; note?: string }
  | { type: "request.decline"; uid: string; plan: string; note?: string }
  | { type: "key.revoke"; uid: string; slot: string }
  | { type: "key.plan"; uid: string; slot: string; plan: string }
  | { type: "user.disable" | "user.enable"; uid: string }
  | { type: "user.website-plan"; uid: string; plan: "pro" | "free" | "beta" }
  | { type: "user.tier"; uid: string; tier: Tier; tag: "assigned" | "paid"; days: number; note?: string };

export const MAX_DAYS = 3650;

export function validate(a: Row | null): Action {
  if (!a || typeof a.type !== "string" || !UID.test(String(a.uid || ""))) throw new ActionError("Bad action");
  const note = a.note == null ? undefined : String(a.note).slice(0, NOTE_MAX);
  switch (a.type) {
    case "request.approve": case "request.decline":
      if (!REQ_PLAN[a.plan]) throw new ActionError("Unknown request");
      return { type: a.type, uid: a.uid, plan: a.plan, note };
    case "key.revoke":
      if (!SLOT.test(a.slot)) throw new ActionError("Bad key slot");
      return { type: a.type, uid: a.uid, slot: a.slot };
    case "key.plan":
      if (!SLOT.test(a.slot) || !PLANS[a.plan]) throw new ActionError("Bad key or plan");
      return { type: a.type, uid: a.uid, slot: a.slot, plan: a.plan };
    case "user.disable": case "user.enable":
      return { type: a.type, uid: a.uid };
    case "user.website-plan":
      if (!["pro", "free", "beta"].includes(a.plan)) throw new ActionError("Bad plan");
      return { type: a.type, uid: a.uid, plan: a.plan };
    case "user.tier":
      if (!Object.hasOwn(TIERS, a.tier) || !["assigned", "paid"].includes(a.tag)) throw new ActionError("Bad subscription");
      { const days = a.days == null || a.days === "" ? 0 : Number(a.days);       // 0 = no end date
        if (!Number.isInteger(days) || days < 0 || days > MAX_DAYS) throw new ActionError(`Days must be a whole number from 1 to ${MAX_DAYS} (or none)`);
        return { type: a.type, uid: a.uid, tier: a.tier, tag: a.tag, days: a.tier === "free" ? 0 : days, note }; }
  }
  throw new ActionError("Unknown action");
}

const authHint = (e: unknown) => (/ 403|INSUFFICIENT_PERMISSION/.test(String((e as Error).message))
  ? new ActionError("Grant api-worker the Firebase Authentication Admin role to change accounts", 403) : e);

/** Apply an action; returns a short description for the log and the page. */
export async function apply(g: Google, admin: string, a: Action, now = new Date()): Promise<{ done: string; detail: Row }> {
  let done = "", detail: Row = {};
  switch (a.type) {
    case "request.approve": case "request.decline": {
      const req = await g.get(`users/${a.uid}/requests/${a.plan}`);
      if (!req) throw new ActionError("No such request", 404);
      if (req.status !== "pending") throw new ActionError(`The request is ${req.status}, not pending`, 409);
      const status = a.type === "request.approve" ? "approved" : "declined";
      await g.patch(`users/${a.uid}/requests/${a.plan}`, { status, decided: "now", decidedBy: admin, ...(a.note ? { reply: a.note } : {}) });
      if (status === "approved") {                 // the plan goes onto every live key (and new keys keep the request's plan)
        const plan = REQ_PLAN[a.plan];
        const keys = (await g.list(`users/${a.uid}/keys`)).filter((k) => !k.revoked);
        for (const k of keys) await g.patch(`users/${a.uid}/keys/${k._id}`, { plan });
        detail = { plan, keys: keys.map((k) => k._id) };
        done = `Approved ${a.plan}: ${keys.length} key${keys.length === 1 ? "" : "s"} moved to ${plan}`;
        // API Plus and Business include CricSynthesis Pro on the website and app: an assigned billing record (as
        // "Set subscription"), unless their own Razorpay subscription already gives it
        const pro = await g.get(`users/${a.uid}/billing/pro`).catch(() => null);
        const subPaid = Boolean(pro?.subscriptionId && pro.status !== "comp" && pro.proUntil && Date.parse(pro.proUntil) > now.getTime());
        if (!subPaid) await g.patch(`users/${a.uid}/billing/pro`, { product: "pro", status: "comp", proUntil: new Date(Date.UTC(2099, 11, 31)),
                                                                   billing: null, trialUsed: true, cancelAtEnd: false, updated: "now" }, false);
        await g.put(`users/${a.uid}/billing/admin`, { tier: plan === "business" ? "business" : "api-plus", tag: "paid", at: now.toISOString() });
        detail.websitePro = true;
        done += "; CricSynthesis Pro turned on";
      } else done = `Declined ${a.plan}`;
      if (a.note) detail.note = a.note;
      break;
    }
    case "key.revoke":
      await g.patch(`users/${a.uid}/keys/${a.slot}`, { revoked: true, revokedAt: "now", revokedBy: admin });
      done = `Revoked key ${a.slot}`;
      break;
    case "key.plan":
      await g.patch(`users/${a.uid}/keys/${a.slot}`, { plan: a.plan });
      done = `Key ${a.slot} set to ${a.plan}`;
      break;
    case "user.disable": case "user.enable":
      await g.updateUser(a.uid, { disabled: a.type === "user.disable" }).catch((e) => { throw authHint(e); });
      done = a.type === "user.disable" ? "Account disabled" : "Account enabled";
      break;
    case "user.website-plan": {
      const u: AuthUser | null = await g.user(a.uid).catch(() => null);
      const claims = { ...(u?.claims || {}) };
      if (a.plan === "beta") delete claims.plan; else claims.plan = a.plan;
      await g.updateUser(a.uid, { claims }).catch((e) => { throw authHint(e); });
      done = a.plan === "beta" ? "Website plan back to default (their own subscription decides)" : `Website plan set to ${a.plan}`;
      break;
    }
    case "user.tier": {
      // Website / app: every tier but Free includes CricSynthesis Pro, written as an assigned billing record
      // (users/{uid}/billing/pro, status "comp", as the Grant Pro workflow does; Firestore only, no Auth admin role).
      // API: the plan goes on every live key. A Razorpay subscription is never touched (the customer cancels it, or it
      // lapses). Recorded in billing/admin for the Paid / Assigned tag.
      const plan = apiPlanFor(a.tier);
      const until = a.days ? new Date(now.getTime() + a.days * 86400_000) : null;   // null = no end date
      const keys = (await g.list(`users/${a.uid}/keys`)).filter((k) => !k.revoked);
      for (const k of keys) if ((k.plan || "free") !== plan) await g.patch(`users/${a.uid}/keys/${k._id}`, { plan });
      const pro = await g.get(`users/${a.uid}/billing/pro`).catch(() => null);
      const subPaid = Boolean(pro?.subscriptionId && pro.status !== "comp" && pro.proUntil && Date.parse(pro.proUntil) > now.getTime());
      const notes: string[] = [];
      if (a.tier !== "free" && !subPaid) {
        await g.patch(`users/${a.uid}/billing/pro`, { product: "pro", status: "comp", proUntil: until || new Date(Date.UTC(2099, 11, 31)),
                                                     billing: null, trialUsed: true, cancelAtEnd: false, updated: "now" }, false);
        notes.push("website Pro on");
      } else if (a.tier !== "free") notes.push("website Pro stays on their Razorpay subscription");
      if (a.tier === "free") {
        if (pro?.status === "comp") {
          await g.patch(`users/${a.uid}/billing/pro`, { status: "ended", proUntil: now, updated: "now" });
          notes.push("assigned Pro ended");
        }
        if (subPaid) notes.push(`their own Razorpay subscription keeps Pro until ${String(pro!.proUntil).slice(0, 10)}`);
        // an older assignment may sit in the account's `plan` claim: clear it if we can
        const u: AuthUser | null = await g.user(a.uid).catch(() => null);
        if (u?.claims?.plan) {
          const claims = { ...u.claims };
          delete claims.plan;
          try { await g.updateUser(a.uid, { claims }); notes.push("old Pro claim removed"); }
          catch { notes.push("an old Pro claim is still on the account (needs the Firebase Authentication Admin role to remove)"); }
        }
      }
      if (plan !== "free" && !keys.length) notes.push("no API keys yet: set it again after they create one");
      await g.put(`users/${a.uid}/billing/admin`, { tier: a.tier, tag: a.tier === "free" ? "" : a.tag, at: now.toISOString(),
                                                   until: until ? until.toISOString() : "" });
      detail = { tier: a.tier, tag: a.tag, apiPlan: plan, until: until ? until.toISOString() : null, keys: keys.map((k) => k._id), ...(a.note ? { note: a.note } : {}) };
      done = `Subscription set to ${TIERS[a.tier]}${a.tier === "free" ? "" : ` (${a.tag === "paid" ? "Paid" : "Assigned"})`}`
        + (a.tier === "free" ? "" : until ? ` for ${a.days} day${a.days === 1 ? "" : "s"} (until ${until.toISOString().slice(0, 10)})` : ", no end date")
        + (keys.length ? `; ${keys.length} key${keys.length === 1 ? "" : "s"} on ${plan}` : "") + (notes.length ? `; ${notes.join("; ")}` : "");
      break;
    }
  }
  await g.put(`adminLog/${now.getTime()}-${a.type}`, { at: now.toISOString(), email: admin, what: a.type, uid: a.uid,
    done, detail: JSON.stringify(detail) }).catch(() => {});
  return { done, detail };
}

/** Console assignments whose end date has passed go back to CricSynthesis Free (website Pro has already stopped at
 *  proUntil; this moves the API keys back and records it). Run by the 6-hourly cron; returns the accounts moved. */
export async function expire(g: Google, billing: Row[], now = new Date()): Promise<string[]> {
  const due = billing.filter((b) => b._id === "admin" && b.tier && b.tier !== "free" && b.until && Date.parse(b.until) <= now.getTime());
  const moved: string[] = [];
  for (const b of due) {
    const uid = String(b._path).split("/")[1];
    if (!UID.test(uid)) continue;
    try {
      await apply(g, "system (subscription ended)", { type: "user.tier", uid, tier: "free", tag: "assigned", days: 0,
                                                    note: `${TIERS[b.tier as Tier] || b.tier} ended ${String(b.until).slice(0, 10)}` }, now);
      moved.push(uid);
    } catch { /* try again next run */ }
  }
  return moved;
}
