// Firestore over REST with a service account (Worker secret GOOGLE_SA = the account's JSON key): an OAuth token from a
// signed JWT (cached until near expiry), a collection-group lookup of API keys by hash, and usage increments.
export type SA = { client_email: string; private_key: string; project_id?: string };

const tokens = new Map<string, { v: string; exp: number }>();
const DATASTORE = "https://www.googleapis.com/auth/datastore";

const b64url = (b: ArrayBuffer | Uint8Array | string): string => {
  const bytes = typeof b === "string" ? new TextEncoder().encode(b) : new Uint8Array(b);
  let s = "";
  for (const x of bytes) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

/** An OAuth access token for the service account (cached per account and scope until near expiry). */
export async function accessToken(sa: SA, scope = DATASTORE): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const ck = `${sa.client_email} ${scope}`;
  const token = tokens.get(ck);
  if (token && token.exp - 120 > now) return token.v;
  const pem = sa.private_key.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const head = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(JSON.stringify({ iss: sa.client_email, scope,
                                         aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }));
  const sig = b64url(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${head}.${claims}`)));
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${head}.${claims}.${sig}`,
  });
  if (!r.ok) throw new Error(`token ${r.status}`);
  const j: any = await r.json();
  tokens.set(ck, { v: j.access_token, exp: now + (j.expires_in || 3600) });
  return j.access_token;
}

export class Firestore {
  sa: SA; project: string;
  constructor(saJson: string, project?: string) {
    this.sa = JSON.parse(saJson);
    this.project = project || this.sa.project_id || "";
  }
  private get root() { return `https://firestore.googleapis.com/v1/projects/${this.project}/databases/(default)/documents`; }

  private async call(path: string, body: unknown): Promise<any> {
    const r = await fetch(`${this.root}${path}`, {
      method: "POST", headers: { Authorization: `Bearer ${await accessToken(this.sa)}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(`firestore ${r.status}: ${(await r.text()).slice(0, 200)}`);
    return r.json();
  }

  /** The dashboard key with this SHA-256 hash: {owner uid, slot, plan, revoked}. */
  async findKey(hash: string): Promise<{ owner: string; slot: string; plan: string; revoked: boolean } | null> {
    const rows: any[] = await this.call(":runQuery", { structuredQuery: {
      from: [{ collectionId: "keys", allDescendants: true }],
      where: { fieldFilter: { field: { fieldPath: "hash" }, op: "EQUAL", value: { stringValue: hash } } },
      limit: 1 } });
    const doc = rows.find((x) => x.document)?.document;
    if (!doc) return null;
    const parts = String(doc.name).split("/");            // …/users/{uid}/keys/{slot}
    const f = doc.fields || {};
    return { owner: parts[parts.length - 3], slot: parts[parts.length - 1], plan: f.plan?.stringValue || "free",
             revoked: Boolean(f.revoked?.booleanValue) };
  }

  /** A document as plain values (strings, numbers, booleans, timestamps as ISO strings), or null when missing. */
  async getDoc(path: string): Promise<Record<string, unknown> | null> {
    const r = await fetch(`${this.root}/${path}`, { headers: { Authorization: `Bearer ${await accessToken(this.sa)}` } });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`firestore ${r.status}`);
    const d: any = await r.json();
    return Object.fromEntries(Object.entries(d.fields || {}).map(([k, v]) => [k, fromValue(v)]));
  }

  /** Set these fields on a document (creating it if needed); other fields are kept. */
  async setFields(path: string, fields: Record<string, unknown>) {
    const mask = Object.keys(fields).map((k) => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join("&");
    const r = await fetch(`${this.root}/${path}?${mask}`, {
      method: "PATCH", headers: { Authorization: `Bearer ${await accessToken(this.sa)}`, "Content-Type": "application/json" },
      body: JSON.stringify({ fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, toValue(v)])) }),
    });
    if (!r.ok) throw new Error(`firestore ${r.status}: ${(await r.text()).slice(0, 200)}`);
  }

  /** Whether the account holder confirmed they are 18 or over (users/{uid}.adult, set by the website's age check). */
  /** The account's email and name from Firebase Auth (for account emails); null if it doesn't exist. */
  async authUser(uid: string): Promise<{ email: string | null; name: string | null } | null> {
    const r = await fetch(`https://identitytoolkit.googleapis.com/v1/projects/${this.project}/accounts:lookup`, {
      method: "POST", body: JSON.stringify({ localId: [uid] }),
      headers: { Authorization: `Bearer ${await accessToken(this.sa, "https://www.googleapis.com/auth/cloud-platform")}`, "Content-Type": "application/json" },
    });
    if (!r.ok) throw new Error(`identitytoolkit ${r.status}`);
    const u = ((await r.json()) as any).users?.[0];
    return u ? { email: u.email ?? null, name: u.displayName ?? null } : null;
  }

  async isAdult(uid: string): Promise<boolean> {
    const r = await fetch(`${this.root}/users/${encodeURIComponent(uid)}?mask.fieldPaths=adult`,
                          { headers: { Authorization: `Bearer ${await accessToken(this.sa)}` } });
    if (r.status === 404) return false;
    if (!r.ok) throw new Error(`firestore ${r.status}`);
    const d: any = await r.json();
    return d.fields?.adult?.booleanValue === true;
  }

  /** Add to users/{uid}/usage/{day} (total, per key slot, per category, per endpoint or tool) and set the key's lastUsed. */
  async addUsage(uid: string, day: string, slot: string, total: number, cats: Record<string, number>, last: string,
                 eps: Record<string, number> = {}) {
    const usage = `projects/${this.project}/databases/(default)/documents/users/${uid}/usage/${day}`;
    const key = `projects/${this.project}/databases/(default)/documents/users/${uid}/keys/${slot}`;
    const inc = (fieldPath: string, n: number) => ({ fieldPath, increment: { integerValue: String(n) } });
    const writes: unknown[] = [
      { update: { name: usage, fields: { day: { stringValue: day } } }, updateMask: { fieldPaths: ["day"] },
        updateTransforms: [inc("total", total), inc(`keys.${slot}`, total),
                           ...Object.entries(cats).map(([c, n]) => inc(`cats.${c}`, n)),
                           ...Object.entries(eps).filter(([e]) => /^[a-z][a-z0-9_]{0,63}$/.test(e)).map(([e, n]) => inc(`eps.${e}`, n)),
                           { fieldPath: "updated", setToServerValue: "REQUEST_TIME" }] },
    ];
    // a dashboard key's lastUsed; the MCP connector's sign-in (slot "mcp") has no key document
    if (slot !== "mcp") {
      writes.push({ update: { name: key, fields: { lastUsed: { timestampValue: last } } }, updateMask: { fieldPaths: ["lastUsed"] },
                    currentDocument: { exists: true } });
    }
    await this.call(":commit", { writes });
  }
}

/** Plain value → Firestore value (Dates become timestamps). */
export function toValue(v: unknown): any {
  if (v === null || v === undefined) return { nullValue: null };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  return { stringValue: String(v) };
}

/** Firestore value → plain value (timestamps as ISO strings). */
export function fromValue(v: any): unknown {
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("timestampValue" in v) return v.timestampValue;
  return null;
}
