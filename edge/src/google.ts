// Firestore over REST with a service account (Worker secret GOOGLE_SA = the account's JSON key): an OAuth token from a
// signed JWT (cached until near expiry), a collection-group lookup of API keys by hash, and usage increments.
type SA = { client_email: string; private_key: string; project_id?: string };

let token: { v: string; exp: number } | null = null;

const b64url = (b: ArrayBuffer | Uint8Array | string): string => {
  const bytes = typeof b === "string" ? new TextEncoder().encode(b) : new Uint8Array(b);
  let s = "";
  for (const x of bytes) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

async function accessToken(sa: SA): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (token && token.exp - 120 > now) return token.v;
  const pem = sa.private_key.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const head = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(JSON.stringify({ iss: sa.client_email, scope: "https://www.googleapis.com/auth/datastore",
                                         aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }));
  const sig = b64url(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${head}.${claims}`)));
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${head}.${claims}.${sig}`,
  });
  if (!r.ok) throw new Error(`token ${r.status}`);
  const j: any = await r.json();
  token = { v: j.access_token, exp: now + (j.expires_in || 3600) };
  return token.v;
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

  /** Add to users/{uid}/usage/{day} (total, per key slot, per category) and set the key's lastUsed. */
  async addUsage(uid: string, day: string, slot: string, total: number, cats: Record<string, number>, last: string) {
    const usage = `projects/${this.project}/databases/(default)/documents/users/${uid}/usage/${day}`;
    const key = `projects/${this.project}/databases/(default)/documents/users/${uid}/keys/${slot}`;
    const inc = (fieldPath: string, n: number) => ({ fieldPath, increment: { integerValue: String(n) } });
    const writes: unknown[] = [
      { update: { name: usage, fields: { day: { stringValue: day } } }, updateMask: { fieldPaths: ["day"] },
        updateTransforms: [inc("total", total), inc(`keys.${slot}`, total),
                           ...Object.entries(cats).map(([c, n]) => inc(`cats.${c}`, n)),
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
