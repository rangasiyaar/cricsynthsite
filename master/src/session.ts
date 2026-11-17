// Admin sign-in: the page signs in with Google (Firebase Auth) and posts the ID token once; if the token is valid,
// the email verified and on ADMIN_EMAILS, we set an 8-hour session cookie (__Host-, HttpOnly, Secure, SameSite=Strict)
// carrying {email, uid, exp} with an HMAC signature. Every /api call checks it.
import { firebaseUser } from "../../edge/src/oauth.ts";
import { type Env, project } from "./env.ts";

export const COOKIE = "__Host-cs_admin";
export const SESSION_TTL = 8 * 3600;
const enc = new TextEncoder();

const b64url = (b: ArrayBuffer | Uint8Array): string => {
  let s = "";
  for (const x of new Uint8Array(b)) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const fromB64url = (s: string): Uint8Array => {
  const t = s.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(t + "===".slice((t.length + 3) % 4)), (c) => c.charCodeAt(0));
};

export function admins(env: Env): Set<string> {
  return new Set((env.ADMIN_EMAILS || "").split(/[,\s]+/).map((e) => e.trim().toLowerCase()).filter(Boolean));
}

async function key(env: Env): Promise<CryptoKey> {
  const src = env.SESSION_SECRET || (env.GOOGLE_SA ? `cricsynthesis-master-session:${env.GOOGLE_SA}` : "");
  if (!src) throw new Error("Sessions aren't set up (no SESSION_SECRET or GOOGLE_SA)");
  const raw = await crypto.subtle.digest("SHA-256", enc.encode(src));
  return crypto.subtle.importKey("raw", raw, { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export type Session = { email: string; uid: string; exp: number };

export async function seal(env: Env, s: Session): Promise<string> {
  const body = b64url(enc.encode(JSON.stringify(s)));
  return `${body}.${b64url(await crypto.subtle.sign("HMAC", await key(env), enc.encode(body)))}`;
}

export async function unseal(env: Env, token: string | undefined | null): Promise<Session | null> {
  if (!token || token.length > 2048) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  try {
    if (!(await crypto.subtle.verify("HMAC", await key(env), fromB64url(sig), enc.encode(body)))) return null;
    const s = JSON.parse(new TextDecoder().decode(fromB64url(body))) as Session;
    if (!s.email || s.exp < Date.now() / 1000 || !admins(env).has(s.email.toLowerCase())) return null;   // removed admins lose access at once
    return s;
  } catch { return null; }
}

export function cookieValue(req: Request, name = COOKIE): string | null {
  for (const part of (req.headers.get("Cookie") || "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return null;
}

export const setCookie = (v: string, maxAge = SESSION_TTL) =>
  `${COOKIE}=${v}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Strict`;

export async function current(env: Env, req: Request): Promise<Session | null> {
  return unseal(env, cookieValue(req));
}

/** Exchange a Firebase ID token for a session; throws with a short reason when it isn't an admin. */
export async function signIn(env: Env, idToken: string): Promise<Session> {
  if (!admins(env).size) throw new Error("No admins are configured");
  const u = await firebaseUser({ FIRESTORE_PROJECT: project(env) }, idToken).catch(() => null);
  if (!u) throw new Error("Sign in again");
  if (!u.email || !u.emailVerified) throw new Error("This account's email isn't verified");
  if (!admins(env).has(u.email.toLowerCase())) throw new Error("This account isn't an admin");
  if (u.authTime && Date.now() / 1000 - u.authTime > 3600) throw new Error("Sign in again (your sign-in is over an hour old)");
  return { email: u.email.toLowerCase(), uid: u.uid, exp: Math.floor(Date.now() / 1000) + SESSION_TTL };
}
