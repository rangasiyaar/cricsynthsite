// Sign-in for the remote MCP server: OAuth 2.1 as the MCP authorization spec describes (protected-resource and
// authorization-server metadata, dynamic client registration, authorization code with PKCE, refresh tokens).
// Users sign in on the website (cricsynthesis.in/connect, Firebase Auth) and approve the client; this Worker checks
// the Firebase ID token itself. Everything it hands out (client ids, codes, tokens) is HMAC-signed and self-contained,
// so nothing is stored. Codes live 5 minutes and are bound to the client's PKCE verifier.
type Row = Record<string, any>;

const SITE = "https://cricsynthesis.in";
const ACCESS_TTL = 3600, REFRESH_TTL = 30 * 86400, CODE_TTL = 300, REQUEST_TTL = 900;
export const SCOPE = "mcp";

export interface OAuthEnv { OAUTH_SECRET?: string; GOOGLE_SA?: string; FIRESTORE_PROJECT?: string; CONNECT_URL?: string }

export class OAuthError extends Error {
  code: string; status: number;
  constructor(code: string, message: string, status = 400) { super(message); this.code = code; this.status = status; }
}

// ── signing ──
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
const now = () => Math.floor(Date.now() / 1000);

let keyCache: { src: string; key: CryptoKey } | null = null;
async function hmacKey(env: OAuthEnv): Promise<CryptoKey> {
  // OAUTH_SECRET if set; otherwise derived from the service-account secret the Worker already holds
  const src = env.OAUTH_SECRET || (env.GOOGLE_SA ? `cricsynthesis-mcp-oauth:${env.GOOGLE_SA}` : "");
  if (!src) throw new OAuthError("server_error", "Sign-in isn't set up on this server", 500);
  if (keyCache?.src === src) return keyCache.key;
  const raw = await crypto.subtle.digest("SHA-256", enc.encode(src));
  const key = await crypto.subtle.importKey("raw", raw, { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
  keyCache = { src, key };
  return key;
}

export async function sign(env: OAuthEnv, payload: Row): Promise<string> {
  const body = b64url(enc.encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(env), enc.encode(body));
  return `${body}.${b64url(sig)}`;
}

/** The payload of a token we signed, if the signature, type and expiry hold. */
export async function verify(env: OAuthEnv, token: string | null | undefined, typ: string): Promise<Row | null> {
  if (!token || token.length > 8192) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  let ok = false;
  try { ok = await crypto.subtle.verify("HMAC", await hmacKey(env), fromB64url(sig), enc.encode(body)); } catch { return null; }
  if (!ok) return null;
  let p: Row;
  try { p = JSON.parse(new TextDecoder().decode(fromB64url(body))); } catch { return null; }
  if (p.typ !== typ || (p.exp && p.exp < now())) return null;
  return p;
}

const sha256b64url = async (s: string) => b64url(await crypto.subtle.digest("SHA-256", enc.encode(s)));

// ── Firebase ID tokens (from the website's sign-in) ──
let jwks: { t: number; keys: Row[] } | null = null;
async function firebaseKeys(): Promise<Row[]> {
  if (jwks && Date.now() - jwks.t < 3600_000) return jwks.keys;
  const r = await fetch("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com");
  if (!r.ok) throw new OAuthError("server_error", "Couldn't check the sign-in", 502);
  jwks = { t: Date.now(), keys: ((await r.json()) as Row).keys };
  return jwks.keys;
}

export async function firebaseUser(env: OAuthEnv, idToken: string): Promise<{ uid: string; email: string | null }> {
  const project = env.FIRESTORE_PROJECT || (env.GOOGLE_SA ? JSON.parse(env.GOOGLE_SA).project_id : "") || "cricsynthesis";
  const [h, p, s] = idToken.split(".");
  if (!h || !p || !s) throw new OAuthError("access_denied", "Sign in again");
  const head = JSON.parse(new TextDecoder().decode(fromB64url(h)));
  const claims = JSON.parse(new TextDecoder().decode(fromB64url(p)));
  const jwk = (await firebaseKeys()).find((k) => k.kid === head.kid);
  if (head.alg !== "RS256" || !jwk) throw new OAuthError("access_denied", "Sign in again");
  const key = await crypto.subtle.importKey("jwk", jwk as JsonWebKey, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, fromB64url(s), enc.encode(`${h}.${p}`));
  const t = now();
  if (!ok || claims.aud !== project || claims.iss !== `https://securetoken.google.com/${project}` || !claims.sub
      || claims.exp < t || claims.iat > t + 300) {
    throw new OAuthError("access_denied", "Sign in again");
  }
  return { uid: claims.sub, email: claims.email ?? null };
}

// ── metadata ──
export function resourceMetadata(origin: string, path: string): Row {
  return { resource: origin + (path === "/mcp" ? "/mcp" : ""), authorization_servers: [origin], scopes_supported: [SCOPE],
           bearer_methods_supported: ["header"], resource_name: "CricSynthesis", resource_documentation: `${SITE}/mcp/` };
}

export function serverMetadata(origin: string): Row {
  return { issuer: origin, authorization_endpoint: `${origin}/authorize`, token_endpoint: `${origin}/token`,
           registration_endpoint: `${origin}/register`, scopes_supported: [SCOPE], response_types_supported: ["code"],
           grant_types_supported: ["authorization_code", "refresh_token"], code_challenge_methods_supported: ["S256"],
           token_endpoint_auth_methods_supported: ["none"], service_documentation: `${SITE}/mcp/` };
}

/** The header a 401 from /mcp carries, so clients find how to sign in. */
export const challenge = (origin: string, path: string) =>
  `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource${path === "/mcp" ? "/mcp" : ""}", scope="${SCOPE}"`;

// ── dynamic client registration (RFC 7591): the client id carries its own redirect URIs, signed ──
const okRedirect = (u: string): boolean => {
  try {
    const x = new URL(u);
    if (x.hash) return false;
    if (x.protocol === "https:") return true;
    return x.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(x.hostname);
  } catch { return false; }
};

export async function register(env: OAuthEnv, body: Row): Promise<Row> {
  const uris: unknown = body?.redirect_uris;
  if (!Array.isArray(uris) || !uris.length || uris.length > 10 || !uris.every((u) => typeof u === "string" && u.length < 2000 && okRedirect(u))) {
    throw new OAuthError("invalid_redirect_uri", "redirect_uris: up to 10 https URLs (or http on localhost)");
  }
  const name = typeof body.client_name === "string" ? body.client_name.slice(0, 80) : "An MCP client";
  const issued = now();
  const client_id = await sign(env, { typ: "client", r: uris, n: name, iat: issued });
  return { client_id, client_id_issued_at: issued, client_name: name, redirect_uris: uris,
           grant_types: ["authorization_code", "refresh_token"], response_types: ["code"], token_endpoint_auth_method: "none", scope: SCOPE };
}

async function client(env: OAuthEnv, clientId: string | null): Promise<Row> {
  const c = await verify(env, clientId, "client");
  if (!c) throw new OAuthError("invalid_client", "Unknown client: register it first", 401);
  return c;
}

// ── authorization: hand the request to the website's connect page ──
export async function authorize(env: OAuthEnv, origin: string, q: URLSearchParams): Promise<string> {
  const cid = q.get("client_id");
  const c = await client(env, cid);
  const ru = q.get("redirect_uri") || (c.r.length === 1 ? c.r[0] : "");
  if (!c.r.includes(ru)) throw new OAuthError("invalid_request", "redirect_uri isn't one this client registered");
  const back = (error: string, desc: string) => {
    const u = new URL(ru);
    u.searchParams.set("error", error);
    u.searchParams.set("error_description", desc);
    if (q.get("state")) u.searchParams.set("state", q.get("state")!);
    return u.toString();
  };
  if (q.get("response_type") !== "code") return back("unsupported_response_type", "Only response_type=code");
  const cc = q.get("code_challenge");
  if (!cc || q.get("code_challenge_method") !== "S256") return back("invalid_request", "PKCE with S256 is required");
  const req = await sign(env, { typ: "req", cid, ru, cc, st: q.get("state") ?? null, aud: origin, n: c.n, exp: now() + REQUEST_TTL });
  const page = new URL(env.CONNECT_URL || `${SITE}/connect/`);
  page.searchParams.set("req", req);
  return page.toString();
}

/** The connect page's answer: the signed-in user allowed (or declined) the client. Returns where to send the browser. */
export async function complete(env: OAuthEnv, body: Row): Promise<string> {
  const r = await verify(env, body?.req, "req");
  if (!r) throw new OAuthError("invalid_request", "This sign-in link has expired. Start connecting again from your app.");
  const u = new URL(r.ru);
  if (r.st) u.searchParams.set("state", r.st);
  if (body.allow !== true) {
    u.searchParams.set("error", "access_denied");
    return u.toString();
  }
  const user = await firebaseUser(env, String(body.id_token || ""));
  u.searchParams.set("code", await sign(env, { typ: "code", uid: user.uid, cid: r.cid, ru: r.ru, cc: r.cc, aud: r.aud,
                                               exp: now() + CODE_TTL }));
  return u.toString();
}

async function tokens(env: OAuthEnv, uid: string, cid: string, aud: string): Promise<Row> {
  return { access_token: await sign(env, { typ: "at", uid, cid, aud, exp: now() + ACCESS_TTL }), token_type: "Bearer",
           expires_in: ACCESS_TTL, refresh_token: await sign(env, { typ: "rt", uid, cid, aud, exp: now() + REFRESH_TTL }), scope: SCOPE };
}

/** POST /token: authorization_code (with PKCE) or refresh_token. */
export async function token(env: OAuthEnv, origin: string, f: URLSearchParams): Promise<Row> {
  const grant = f.get("grant_type");
  const cid = f.get("client_id");
  if (grant === "authorization_code") {
    const code = await verify(env, f.get("code"), "code");
    if (!code || code.aud !== origin) throw new OAuthError("invalid_grant", "The code is invalid or has expired");
    if (cid && cid !== code.cid) throw new OAuthError("invalid_grant", "The code was issued to another client");
    if (f.get("redirect_uri") && f.get("redirect_uri") !== code.ru) throw new OAuthError("invalid_grant", "redirect_uri doesn't match");
    const verifier = f.get("code_verifier") || "";
    if (verifier.length < 43 || verifier.length > 128 || (await sha256b64url(verifier)) !== code.cc) {
      throw new OAuthError("invalid_grant", "PKCE check failed");
    }
    return tokens(env, code.uid, code.cid, code.aud);
  }
  if (grant === "refresh_token") {
    const rt = await verify(env, f.get("refresh_token"), "rt");
    if (!rt || rt.aud !== origin || (cid && cid !== rt.cid)) throw new OAuthError("invalid_grant", "The refresh token is invalid or has expired");
    return tokens(env, rt.uid, rt.cid, rt.aud);
  }
  throw new OAuthError("unsupported_grant_type", "Use authorization_code or refresh_token");
}

/** The user behind an access token for this server, or null. */
export async function accessUser(env: OAuthEnv, origin: string, bearer: string | null): Promise<string | null> {
  const t = await verify(env, bearer, "at");
  return t && t.aud === origin ? t.uid : null;
}
