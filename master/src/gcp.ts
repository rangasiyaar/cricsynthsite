// Read-only Google access for the console: Firestore REST (documents decoded to plain JSON) and the Firebase Auth
// admin API (Identity Toolkit). The one write is the console's own snapshot / sign-in log (adminSnapshot, adminLog).
import { accessToken, type SA } from "../../edge/src/google.ts";

const CLOUD = "https://www.googleapis.com/auth/cloud-platform";
type Row = Record<string, any>;

export function decode(v: any): any {
  if (!v || typeof v !== "object") return null;
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return Number(v.doubleValue);
  if ("booleanValue" in v) return v.booleanValue;
  if ("timestampValue" in v) return v.timestampValue;
  if ("nullValue" in v) return null;
  if ("referenceValue" in v) return v.referenceValue;
  if ("mapValue" in v) return fields(v.mapValue.fields);
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(decode);
  return null;
}
export const fields = (f: Row | undefined): Row => Object.fromEntries(Object.entries(f || {}).map(([k, v]) => [k, decode(v)]));

/** A decoded document: its fields plus _path (users/u1/keys/k1) and _id. */
export type Doc = Row & { _path: string; _id: string };

export class Google {
  sa: SA; project: string; fetcher: typeof fetch;
  constructor(saJson: string, project?: string, fetcher: typeof fetch = (input, init) => fetch(input, init)) {   // a bare `fetch` stored on the object throws "Illegal invocation" in Workers
    this.sa = JSON.parse(saJson);
    this.project = project || this.sa.project_id || "";
    this.fetcher = fetcher;
  }
  get docsRoot() { return `projects/${this.project}/databases/(default)/documents`; }

  private async call(url: string, init: RequestInit = {}, scope = CLOUD): Promise<any> {
    const r = await this.fetcher(url, { ...init, headers: { Authorization: `Bearer ${await accessToken(this.sa, scope)}`,
      "Content-Type": "application/json", ...(init.headers || {}) } });
    if (!r.ok) throw new Error(`${new URL(url).hostname.split(".")[0]} ${r.status}: ${(await r.text()).slice(0, 160)}`);
    return r.json();
  }
  private doc(d: any): Doc {
    const path = String(d.name).split("/documents/")[1] || "";
    return { ...fields(d.fields), _path: path, _id: path.split("/").pop() || "", _created: d.createTime, _updated: d.updateTime } as Doc;
  }

  async get(path: string): Promise<Doc | null> {
    try { return this.doc(await this.call(`https://firestore.googleapis.com/v1/${this.docsRoot}/${path}`)); }
    catch (e) { if (String(e).includes(" 404")) return null; throw e; }
  }

  /** Every document in a collection (paged). showMissing also lists parents that only have subcollections. */
  async list(path: string, showMissing = false): Promise<Doc[]> {
    const out: Doc[] = [];
    let page = "";
    for (let i = 0; i < 50; i++) {
      const q = new URLSearchParams({ pageSize: "300", ...(showMissing ? { showMissing: "true" } : {}), ...(page ? { pageToken: page } : {}) });
      const d = await this.call(`https://firestore.googleapis.com/v1/${this.docsRoot}/${path}?${q}`);
      out.push(...(d.documents || []).map((x: any) => this.doc(x)));
      page = d.nextPageToken || "";
      if (!page) break;
    }
    return out;
  }

  /** A structured query under `parent` ("" = the root). */
  async query(parent: string, structuredQuery: Row): Promise<Doc[]> {
    const rows: any[] = await this.call(`https://firestore.googleapis.com/v1/${this.docsRoot}${parent ? "/" + parent : ""}:runQuery`,
      { method: "POST", body: JSON.stringify({ structuredQuery }) });
    return rows.filter((x) => x.document).map((x) => this.doc(x.document));
  }

  /** All documents of a collection id anywhere (every user's keys, say), no filter so no index is needed. */
  group(collectionId: string): Promise<Doc[]> {
    return this.query("", { from: [{ collectionId, allDescendants: true }] });
  }

  /** users/{uid}/usage from `fromDay` (YYYY-MM-DD) on: a key range on the document id, so no index is needed. */
  usage(uid: string, fromDay: string): Promise<Doc[]> {
    return this.query(`users/${uid}`, { from: [{ collectionId: "usage" }], where: { fieldFilter: {
      field: { fieldPath: "__name__" }, op: "GREATER_THAN_OR_EQUAL",
      value: { referenceValue: `${this.docsRoot}/users/${uid}/usage/${fromDay}` } } } });
  }

  /** Write one document's string fields (the console's snapshot and sign-in log). */
  async put(path: string, data: Record<string, string | number>): Promise<void> {
    const f = Object.fromEntries(Object.entries(data).map(([k, v]) =>
      [k, typeof v === "number" ? { integerValue: String(Math.round(v)) } : { stringValue: v }]));
    await this.call(`https://firestore.googleapis.com/v1/${this.docsRoot}/${path}`, { method: "PATCH", body: JSON.stringify({ fields: f }) });
  }

  /** Set some fields of an existing document (strings, booleans, numbers; "now" for a server timestamp). */
  async patch(path: string, data: Record<string, string | boolean | number | null>, mustExist = true): Promise<void> {
    const name = `${this.docsRoot}/${path}`;
    const enc = (v: unknown) => (v === null ? { nullValue: null } : typeof v === "boolean" ? { booleanValue: v }
      : typeof v === "number" ? { integerValue: String(Math.round(v)) } : { stringValue: String(v) });
    const plain = Object.entries(data).filter(([, v]) => v !== "now");
    const stamps = Object.entries(data).filter(([, v]) => v === "now").map(([k]) => ({ fieldPath: k, setToServerValue: "REQUEST_TIME" }));
    await this.call(`https://firestore.googleapis.com/v1/${this.docsRoot}:commit`, { method: "POST", body: JSON.stringify({ writes: [{
      update: { name, fields: Object.fromEntries(plain.map(([k, v]) => [k, enc(v)])) },
      updateMask: { fieldPaths: plain.map(([k]) => k) }, ...(stamps.length ? { updateTransforms: stamps } : {}),
      ...(mustExist ? { currentDocument: { exists: true } } : {}) }] }) });
  }

  /** The newest documents of a top-level collection by id (ids start with a timestamp). */
  latest(collectionId: string, limit: number): Promise<Doc[]> {
    return this.query("", { from: [{ collectionId }], orderBy: [{ field: { fieldPath: "__name__" }, direction: "DESCENDING" }], limit });
  }

  /** Enable / disable an account or set its custom claims (needs the Firebase Authentication Admin role). */
  async updateUser(uid: string, change: { disabled?: boolean; claims?: Row }): Promise<void> {
    await this.call(`https://identitytoolkit.googleapis.com/v1/projects/${this.project}/accounts:update`, { method: "POST", body: JSON.stringify({
      localId: uid, ...(change.disabled !== undefined ? { disableUser: change.disabled } : {}),
      ...(change.claims !== undefined ? { customAttributes: JSON.stringify(change.claims) } : {}) }) });
  }

  /** Append strings to an array field without reading the document first (one write; creates the doc). */
  async append(path: string, field: string, values: string[]): Promise<void> {
    const name = `${this.docsRoot}/${path}`;
    await this.call(`https://firestore.googleapis.com/v1/${this.docsRoot}:commit`, { method: "POST", body: JSON.stringify({ writes: [{
      update: { name, fields: { id: { stringValue: path.split("/").pop() } } }, updateMask: { fieldPaths: ["id"] },
      updateTransforms: [{ fieldPath: field, appendMissingElements: { values: values.map((v) => ({ stringValue: v })) } }] }] }) });
  }

  /** Daily totals of a Cloud Monitoring metric (needs the Monitoring Viewer role). */
  async dailySum(metricType: string, days: number, now = new Date()): Promise<{ day: string; value: number }[]> {
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
    const start = new Date(end.getTime() - days * 86400_000);
    const q = new URLSearchParams({ filter: `metric.type="${metricType}"`, "interval.startTime": start.toISOString(),
      "interval.endTime": end.toISOString(), "aggregation.alignmentPeriod": "86400s", "aggregation.perSeriesAligner": "ALIGN_SUM",
      "aggregation.crossSeriesReducer": "REDUCE_SUM" });
    const d = await this.call(`https://monitoring.googleapis.com/v3/projects/${this.project}/timeSeries?${q}`);
    const out: Record<string, number> = {};
    for (const s of d.timeSeries || []) for (const p of s.points || []) {
      const day = String(p.interval?.startTime || "").slice(0, 10);
      out[day] = (out[day] || 0) + Number(p.value?.int64Value ?? p.value?.doubleValue ?? 0);
    }
    return Object.entries(out).map(([day, value]) => ({ day, value })).sort((a, b) => a.day.localeCompare(b.day));
  }

  // ── Google Analytics 4 (Data API; the service account is a Viewer on the property) ──
  ga(property: string, method: "runReport" | "runRealtimeReport", body: Row): Promise<any> {
    return this.call(`https://analyticsdata.googleapis.com/v1beta/properties/${property}:${method}`,
      { method: "POST", body: JSON.stringify(body) }, "https://www.googleapis.com/auth/analytics.readonly");
  }

  // ── Search Console (the service account is a Restricted user on the property) ──
  sc(site: string, path: string, body?: Row): Promise<any> {
    const url = `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}${path}`;
    return this.call(url, body ? { method: "POST", body: JSON.stringify(body) } : {}, "https://www.googleapis.com/auth/webmasters.readonly");
  }

  // ── Firebase Auth ──
  /** Every account (Identity Toolkit accounts:query, paged by offset). */
  async users(): Promise<AuthUser[]> {
    const out: AuthUser[] = [];
    for (let offset = 0; offset < 20_000; offset += 500) {
      const d = await this.call(`https://identitytoolkit.googleapis.com/v1/projects/${this.project}/accounts:query`,
        { method: "POST", body: JSON.stringify({ returnUserInfo: true, limit: "500", offset: String(offset) }) });
      const batch = (d.userInfo || []).map(authUser);
      out.push(...batch);
      if (batch.length < 500) break;
    }
    return out;
  }
  async user(uid: string): Promise<AuthUser | null> {
    const d = await this.call(`https://identitytoolkit.googleapis.com/v1/projects/${this.project}/accounts:lookup`,
      { method: "POST", body: JSON.stringify({ localId: [uid] }) });
    return d.users?.[0] ? authUser(d.users[0]) : null;
  }
}

export type AuthUser = { uid: string; email: string | null; name: string | null; photo: string | null; verified: boolean;
                         providers: string[]; created: string | null; lastLogin: string | null; lastActive: string | null;
                         disabled: boolean; claims: Row };

const ms = (v: any) => (v ? new Date(Number(v)).toISOString() : null);
function authUser(u: any): AuthUser {
  let claims: Row = {};
  try { claims = u.customAttributes ? JSON.parse(u.customAttributes) : {}; } catch {}
  return { uid: u.localId, email: u.email || null, name: u.displayName || null, photo: u.photoUrl || null,
           verified: Boolean(u.emailVerified), providers: (u.providerUserInfo || []).map((p: any) => p.providerId),
           created: ms(u.createdAt), lastLogin: ms(u.lastLoginAt), lastActive: u.lastRefreshAt || ms(u.lastLoginAt),
           disabled: Boolean(u.disabled), claims };
}
