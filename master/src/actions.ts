// Admin actions (phase 2). Each is validated, applied with the service account and written to the audit log
// (adminLog/{time}-{type}: who, what, which account, details). Plans live on the keys (users/{uid}/keys/{slot}.plan),
// which the API Worker reads (cached up to a minute); a website plan is the account's `plan` custom claim.
import { PLANS } from "../../edge/src/keys.ts";
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
  | { type: "user.website-plan"; uid: string; plan: "pro" | "free" | "beta" };

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
  }
  throw new ActionError("Unknown action");
}

const authHint = (e: unknown) => (String((e as Error).message).includes(" 403")
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
        // API Plus and Business include CricSynthesis Pro on the website and app (the account's `plan` claim)
        try {
          const u: AuthUser | null = await g.user(a.uid).catch(() => null);
          await g.updateUser(a.uid, { claims: { ...(u?.claims || {}), plan: "pro" } });
          detail.websitePro = true;
          done += "; CricSynthesis Pro turned on";
        } catch { detail.websitePro = false; done += "; CricSynthesis Pro NOT turned on (needs the Firebase Authentication Admin role)"; }
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
  }
  await g.put(`adminLog/${now.getTime()}-${a.type}`, { at: now.toISOString(), email: admin, what: a.type, uid: a.uid,
    done, detail: JSON.stringify(detail) }).catch(() => {});
  return { done, detail };
}
