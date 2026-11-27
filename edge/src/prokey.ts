// Pro data on the public site (cricsim/lock.py): each match file carries the full forecast encrypted with AES-256-GCM
// under a per-match key, HMAC-SHA256(PRO_DATA_KEY, "cs-pro:" + match id).
//   GET /pro/key?match=<id>   (signed in, CricSynthesis Pro)  → {key}: base64 of the match's key, for the website/app
// The Worker's own reads (API, MCP) decrypt with the secret directly (EdgeSource, unlockMatch).
const enc = new TextEncoder();
const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export async function keyFor(secret: string, matchId: string): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(`cs-pro:${matchId}`)));
}

export async function decryptBox(box: { iv: string; ct: string }, key: Uint8Array): Promise<any> {
  const k = await crypto.subtle.importKey("raw", key, "AES-GCM", false, ["decrypt"]);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(box.iv) }, k, unb64(box.ct));
  return JSON.parse(new TextDecoder().decode(plain));
}

/** The full match document (as before the split); unchanged when it isn't locked or there's no secret. */
export async function unlockMatch(doc: any, secret: string | undefined): Promise<any> {
  if (!doc?.locked || !secret || !doc.match?.id) return doc;
  const full = await decryptBox(doc.locked, await keyFor(secret, doc.match.id));
  const { locked: _l, masked: _m, teaser: _t, ...rest } = doc;
  return { ...rest, ...full };
}

export const MATCH_ID = /^[a-z0-9][a-z0-9-]{2,120}$/;

/** Pro for the key endpoint: the same rule as the website (lib/firebase.ts usePlan): a paid or free-day Pro subscription
 *  still running, or a `plan: "pro"` custom claim set by our team. */
export function isPro(claimPlan: unknown, billing: Record<string, unknown> | null, now = Date.now()): boolean {
  if (claimPlan === "pro") return true;
  const until = Date.parse(String(billing?.proUntil ?? ""));
  return Number.isFinite(until) && until > now;
}

export const keyResponse = async (secret: string, matchId: string) => ({ match: matchId, key: b64(await keyFor(secret, matchId)) });
