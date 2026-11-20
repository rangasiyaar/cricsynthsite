// Account emails from the API Worker (templates in emails.ts, sent through Resend with RESEND_API_KEY). Never throws:
// an email that can't be sent is logged and skipped, so billing, keys and API calls never fail because of email.
import * as E from "./emails.ts";
import { Firestore } from "./google.ts";
import type { Env } from "./keys.ts";

export type Who = { email: string | null; name?: string | null };

/** Send `build(name)` to the account `uid` (or to `who` when the caller already knows it). `pref`: a profile switch
 *  (users/{uid}.notifyUsage …) that turns this email off when false (default on). */
export async function mail(env: Env, uid: string, build: (name: string | null) => E.Email, who?: Who | null, pref?: string,
                           fetcher?: typeof fetch): Promise<boolean> {
  if (!env.RESEND_API_KEY) return false;
  try {
    const fs = env.GOOGLE_SA ? new Firestore(env.GOOGLE_SA, env.FIRESTORE_PROJECT) : null;
    if (pref && fs) {
      const prof = await fs.getDoc(`users/${uid}`).catch(() => null);
      if (prof && prof[pref] === false) return false;
    }
    // the caller's email when it has one; the name (and the email otherwise) from Firebase Auth
    const looked = (!who?.email || who.name === undefined) && fs ? await fs.authUser(uid).catch(() => null) : null;
    const u = { email: who?.email || looked?.email || null, name: who?.name ?? looked?.name ?? null };
    if (!u.email) return false;
    await E.send(env.RESEND_API_KEY, u.email, build(u.name ?? null), {}, fetcher);
    return true;
  } catch (e) {
    console.error("email", (e as Error).message);
    return false;
  }
}
