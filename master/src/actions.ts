// Admin actions (phase 2). Each is validated, applied with the service account and written to the audit log
// (adminLog/{time}-{type}: who, what, which account, details). Plans live on the keys (users/{uid}/keys/{slot}.plan),
// which the API Worker reads (cached up to a minute); a website plan is the account's `plan` custom claim.
import { PLANS } from "../../edge/src/keys.ts";
import * as E from "../../edge/src/emails.ts";
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
  | { type: "user.tier"; uid: string; tier: Tier; tag: "assigned" | "paid"; days: number; note?: string }
  | { type: "user.delete"; uid: string }
  | { type: "contact.status"; uid: ""; id: string; status: ContactStatus }
  | { type: "contact.read"; uid: ""; id: string; read: boolean }
  | { type: "contact.delete"; uid: ""; id: string }
  | { type: "application.status"; uid: ""; id: string; status: AppStatus; note?: string }
  | { type: "application.delete"; uid: ""; id: string };

/** Job applications (applications/{id} + resume/{n} chunks, written by the API Worker's POST /apply). Moving one to
 *  Shortlisted or Declined emails the applicant (once per outcome), with the optional note. */
export const APP_STATUS = { new: "New", reviewing: "Reviewing", shortlisted: "Shortlisted", declined: "Declined", hired: "Hired" } as const;
export type AppStatus = keyof typeof APP_STATUS;
export const CAREERS_FROM = "CricSynthesis Careers <careers@cricsynthesis.in>";

/** Contact form messages (contactMessages/{id}, written by the API Worker's POST /contact). */
export const CONTACT_STATUS = { new: "New", replied: "Replied", closed: "Closed" } as const;
export type ContactStatus = keyof typeof CONTACT_STATUS;
const MSG_ID = /^[A-Za-z0-9]{1,40}$/;

/** Sends an account email to `uid` (looked up in Firebase Auth); returns whether it went. Set by the Worker from
 *  RESEND_API_KEY; without it no email is sent. */
export type Mailer = (uid: string, build: (name: string | null) => E.Email, to?: { email: string; name: string | null },
                     opts?: { from?: string }) => Promise<boolean>;

export function mailer(g: Google, key: string | undefined): Mailer {
  return async (uid, build, to, opts) => {
    if (!key) return false;
    try {
      const u = to || await g.user(uid).then((x) => (x?.email ? { email: x.email, name: x.name } : null));
      if (!u) return false;
      await E.send(key, u.email, build(u.name), opts || {});
      return true;
    } catch (e) { console.error("email", (e as Error).message); return false; }
  };
}

export const MAX_DAYS = 3650;
/** Subscriptions moved back to Free per snapshot run (Workers on the free plan may make 50 subrequests per call). */
export const MAX_PER_RUN = 4;

export function validate(a: Row | null): Action {
  if (typeof a?.type === "string" && a.type.startsWith("application.")) {  // a job application, not an account
    if (!MSG_ID.test(String(a.id || ""))) throw new ActionError("Bad application");
    if (a.type === "application.status") {
      if (!Object.hasOwn(APP_STATUS, a.status)) throw new ActionError("Bad status");
      const note = a.note == null || a.note === "" ? undefined : String(a.note).slice(0, NOTE_MAX);
      return { type: a.type, uid: "", id: a.id, status: a.status, ...(note ? { note } : {}) };
    }
    if (a.type === "application.delete") return { type: a.type, uid: "", id: a.id };
    throw new ActionError("Unknown action");
  }
  if (typeof a?.type === "string" && a.type.startsWith("contact.")) {     // a message, not an account
    if (!MSG_ID.test(String(a.id || ""))) throw new ActionError("Bad message");
    if (a.type === "contact.status") {
      if (!Object.hasOwn(CONTACT_STATUS, a.status)) throw new ActionError("Bad status");
      return { type: a.type, uid: "", id: a.id, status: a.status };
    }
    if (a.type === "contact.read") {
      if (typeof a.read !== "boolean") throw new ActionError("Bad read flag");
      return { type: a.type, uid: "", id: a.id, read: a.read };
    }
    if (a.type === "contact.delete") return { type: a.type, uid: "", id: a.id };
    throw new ActionError("Unknown action");
  }
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
    case "user.disable": case "user.enable": case "user.delete":
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
export async function apply(g: Google, admin: string, a: Action, now = new Date(), mail?: Mailer): Promise<{ done: string; detail: Row }> {
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
                                                                   billing: null, subscriptionId: null, trialUsed: true, cancelAtEnd: false, updated: "now" }, false);
        await g.put(`users/${a.uid}/billing/admin`, { tier: plan === "business" ? "business" : "api-plus", tag: "paid", at: now.toISOString() });
        detail.websitePro = true;
        done += "; CricSynthesis Pro turned on";
      } else done = `Declined ${a.plan}`;
      if (a.note) detail.note = a.note;
      if (mail) {
        const plan = a.plan === "api-business" ? "business" : "api-plus";
        const ok = await mail(a.uid, (name) => status === "approved"
          ? E.upgradeApproved({ name, plan, keys: (detail.keys || []).length, note: a.note })
          : E.upgradeDeclined({ name, plan, note: a.note }));
        detail.emailed = ok;
        done += ok ? "; emailed them" : "; no email sent";
      }
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
                                                     billing: null, subscriptionId: null, trialUsed: true, cancelAtEnd: false, updated: "now" }, false);
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
      if (mail && a.tier !== "free") {
        const tier = a.tier as "pro" | "api-plus" | "business";
        notes.push((await mail(a.uid, (name) => E.subscriptionGiven({ name, tier, until, note: a.note }))) ? "emailed them" : "no email sent");
      }
      detail = { tier: a.tier, tag: a.tag, apiPlan: plan, until: until ? until.toISOString() : null, keys: keys.map((k) => k._id), ...(a.note ? { note: a.note } : {}) };
      done = `Subscription set to ${TIERS[a.tier]}${a.tier === "free" ? "" : ` (${a.tag === "paid" ? "Paid" : "Assigned"})`}`
        + (a.tier === "free" ? "" : until ? ` for ${a.days} day${a.days === 1 ? "" : "s"} (until ${until.toISOString().slice(0, 10)})` : ", no end date")
        + (keys.length ? `; ${keys.length} key${keys.length === 1 ? "" : "s"} on ${plan}` : "") + (notes.length ? `; ${notes.join("; ")}` : "");
      break;
    }
    case "user.delete": {
      // A paying subscriber is cancelled in Razorpay first (we can't cancel it from here), so nothing is charged after.
      const pro = await g.get(`users/${a.uid}/billing/pro`).catch(() => null);
      if (pro?.subscriptionId && ["trial", "active", "past_due"].includes(String(pro.status)) && pro.cancelAtEnd !== true) {
        throw new ActionError("They have a live Pro subscription: cancel it in the Razorpay dashboard first, then delete the account", 409);
      }
      const u: AuthUser | null = await g.user(a.uid).catch(() => null);
      const removed: string[] = [];
      for (const sub of ["keys", "requests", "billing"]) {
        for (const d of await g.list(`users/${a.uid}/${sub}`).catch(() => [])) { await g.remove(d._path); removed.push(d._path); }
      }
      for (const d of await g.usage(a.uid, "2000-01-01").catch(() => [])) { await g.remove(d._path); removed.push(d._path); }
      await g.remove(`users/${a.uid}`);
      let signIn = "sign-in account deleted";
      try { await g.deleteUser(a.uid); } catch { signIn = "sign-in account NOT deleted (needs the Firebase Authentication Admin role: delete it in Firebase Console → Authentication)"; }
      const emailed = u?.email && mail ? await mail(a.uid, (name) => E.accountDeleted({ name }), { email: u.email, name: u.name }) : false;
      detail = { email: u?.email ?? null, documents: removed.length, emailed };
      done = `Account data deleted (${removed.length + 1} documents); ${signIn}; ${emailed ? "confirmation emailed" : "no email sent"}`;
      break;
    }
  }
  if (a.type === "contact.status" || a.type === "contact.read" || a.type === "contact.delete") {
    const m = await g.get(`contactMessages/${a.id}`);
    if (!m) throw new ActionError("No such message", 404);
    if (a.type === "contact.status") {
      await g.patch(`contactMessages/${a.id}`, { status: a.status, statusBy: admin, statusAt: now.toISOString(), read: true });
      done = `Message from ${m.email} marked ${CONTACT_STATUS[a.status].toLowerCase()}`;
      detail = { id: a.id, email: m.email, status: a.status };
    } else if (a.type === "contact.read") {
      await g.patch(`contactMessages/${a.id}`, { read: a.read });
      done = `Message from ${m.email} marked ${a.read ? "read" : "unread"}`;
      detail = { id: a.id, email: m.email, read: a.read };
    } else {
      await g.remove(`contactMessages/${a.id}`);
      done = `Message from ${m.email} deleted`;
      detail = { id: a.id, email: m.email, topic: m.topic ?? null, at: m.at ?? null };   // the message text itself isn't kept
    }
  }
  if (a.type === "application.status" || a.type === "application.delete") {
    const ap = await g.get(`applications/${a.id}`);
    if (!ap) throw new ActionError("No such application", 404);
    const who = `${ap.name} (${ap.jobTitle})`;
    if (a.type === "application.status") {
      const outcome = a.status === "shortlisted" || a.status === "declined";
      const already = outcome && ap[`mailed_${a.status}`] === true;
      let emailed = false;
      if (outcome && !already && mail && ap.email) {
        const build = (name: string | null) => (a.status === "shortlisted" ? E.applicationShortlisted : E.applicationDeclined)(
          { name: name || ap.name, jobTitle: String(ap.jobTitle), note: a.note ?? null });
        emailed = await mail("", build, { email: String(ap.email), name: String(ap.name || "") || null }, { from: CAREERS_FROM });
      }
      await g.patch(`applications/${a.id}`, { status: a.status, statusBy: admin, statusAt: now.toISOString(), read: true,
        ...(emailed ? { [`mailed_${a.status}`]: true } : {}), ...(a.note ? { note: a.note } : {}) });
      done = `Application from ${who} marked ${APP_STATUS[a.status].toLowerCase()}` +
        (outcome ? (emailed ? "; applicant emailed" : already ? "; applicant was already emailed" : "; no email sent") : "");
      detail = { id: a.id, email: ap.email, status: a.status, emailed };
    } else {
      const chunks = Number((ap.resume as Row | undefined)?.chunks || 0);
      for (let n = 0; n < Math.min(chunks, 12); n++) await g.remove(`applications/${a.id}/resume/${n}`).catch(() => {});
      await g.remove(`applications/${a.id}`);
      done = `Application from ${who} deleted, with the resume`;
      detail = { id: a.id, email: ap.email, job: ap.job ?? null, at: ap.at ?? null };
    }
  }
  await g.put(`adminLog/${now.getTime()}-${a.type}`, { at: now.toISOString(), email: admin, what: a.type, uid: a.uid,
    done, detail: JSON.stringify(detail) }).catch(() => {});
  return { done, detail };
}

/** Console assignments whose end date has passed go back to CricSynthesis Free (website Pro has already stopped at
 *  proUntil; this moves the API keys back and records it). Run by the 6-hourly cron; returns the accounts moved. */
export async function expire(g: Google, billing: Row[], now = new Date()): Promise<string[]> {
  // a few per run (each takes several requests and a run may make 50); the rest follow 6 hours later
  const due = billing.filter((b) => b._id === "admin" && b.tier && b.tier !== "free" && b.until && Date.parse(b.until) <= now.getTime())
    .slice(0, MAX_PER_RUN);
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

/** The 6-hourly account emails: a reminder 3 days before a subscription our team gave ends, and "Pro has ended" once
 *  a Razorpay subscription's access has stopped (cancelled, halted or expired). Each is recorded so it goes once. */
export async function notices(g: Google, billing: Row[], mail: Mailer, now = new Date()): Promise<string[]> {
  const t = now.getTime(), sent: string[] = [];
  let done = 0;
  for (const b of billing) {
    if (done >= MAX_PER_RUN * 2) break;                // 3 requests per email; the rest go next run
    const uid = String(b._path).split("/")[1];
    if (!UID.test(uid)) continue;
    try {
      if (b._id === "admin" && b.tier && b.tier !== "free" && b.until && b.endingMailed !== b.until) {
        const until = Date.parse(b.until);
        if (until > t && until - t <= 3 * 86400_000) {
          done++;
          if (await mail(uid, (name) => E.subscriptionEnding({ name, tier: b.tier, until: new Date(until) }))) sent.push(`${uid}: ending`);
          await g.patch(b._path.replace(/^.*?users\//, "users/"), { endingMailed: b.until });
        }
      }
      if (b._id === "pro" && b.subscriptionId && b.status !== "comp" && b.mailEnded !== b.subscriptionId && b.mailStarted) {
        const until = Date.parse(b.proUntil);
        if (until <= t && t - until < 7 * 86400_000) {
          done++;
          if (await mail(uid, (name) => E.proEnded({ name }))) sent.push(`${uid}: ended`);
          await g.patch(b._path.replace(/^.*?users\//, "users/"), { mailEnded: b.subscriptionId });
        }
      }
    } catch (e) { console.error("notice", uid, (e as Error).message); }
  }
  return sent;
}
