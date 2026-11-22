// The emails the sign-ups Apps Script used to send, now sent here (and stored in Firestore for the admin console):
//   POST /welcome                    the welcome email, once per account, after it confirms it is 18+ (AgeGate)
//   POST /api-access                 the API access form: stored in contactMessages (kind "api-access"), acknowledged, team told
//   POST /account/upgrade-requested  an API Plus / Business request just filed in the dashboard: acknowledged, team told
//   POST /apply                      a job application: stored in applications/{id} (resume in resume/{n} chunks), acknowledged,
//                                    team told with the resume attached; outcomes are sent from the console
import * as E from "./emails.ts";
import { ContactError as FormError } from "./contact.ts";

export { FormError };
export const TEAM_EMAIL = "hello@cricsynthesis.in";
export const WELCOME_FROM = "CricSynthesis <welcome@cricsynthesis.in>";
export const CAREERS_FROM = "CricSynthesis Careers <careers@cricsynthesis.in>";
export const INTERESTS = ["analytics", "simulation", "graphics", "all"];
export const UPGRADES = ["api-pro", "api-business"];
export const RESUME_TYPES: Record<string, string> = { "application/pdf": "pdf", "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx" };
export const LIMITS = { name: 80, email: 254, field: 120, url: 300, notes: 2000, resumeBytes: 5 * 1024 * 1024, chunk: 800_000,
  perEmailDay: 3, perIpDay: 10 };
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,189}\.[^\s@]{2,}$/;
const MAGIC = ["JVBER", "0M8R4", "UEsDB"];              // base64 of "%PDF", the OLE header, "PK\x03\x04"
const URL_RE = /^https?:\/\/[^\s/.]+\.[^\s]+$/i;

export const clean = (v: unknown, max: number) =>
  String(v ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim().slice(0, max);

export type Send = (to: string, mail: E.Email, opts?: { from?: string; replyTo?: string;
  attachments?: { filename: string; content: string }[] }) => Promise<boolean>;
export type FormDeps = {
  add: (collection: string, fields: Record<string, unknown>) => Promise<string>;
  set: (path: string, fields: Record<string, unknown>) => Promise<void>;
  get: (path: string) => Promise<Record<string, unknown> | null>;
  count: (collection: string, field: string, value: string) => Promise<number>;
  send: Send;
  sha256: (s: string) => Promise<string>;
  now: () => Date;
  team: string;
};

/** Per-day limits by email address and by network, counted on the collection itself. */
async function guard(deps: FormDeps, collection: string, email: string, ip?: string | null) {
  const today = deps.now().toISOString().slice(0, 10);
  const emailDay = `${(await deps.sha256(email)).slice(0, 24)}:${today}`;
  const ipDay = ip ? `${(await deps.sha256(`ip:${ip}`)).slice(0, 24)}:${today}` : "";
  const [a, b] = await Promise.all([deps.count(collection, "emailDay", emailDay), ipDay ? deps.count(collection, "ipDay", ipDay) : 0]);
  if (a >= LIMITS.perEmailDay || b >= LIMITS.perIpDay) {
    throw new FormError(429, "We've received several requests from you today. We'll reply to those first, or email hello@cricsynthesis.in.");
  }
  return { emailDay, ...(ipDay ? { ipDay } : {}) };
}

// ── welcome ──
export async function welcome(deps: FormDeps, user: { uid: string; email: string | null }, name: string | null, source: string) {
  if (!user.email) return { sent: false };
  const prof = await deps.get(`users/${user.uid}`);
  if (prof?.adult !== true || prof.welcomedAt) return { sent: false };
  await deps.set(`users/${user.uid}`, { welcomedAt: deps.now().toISOString(), signupSource: source === "app" ? "app" : "web" });
  const sent = await deps.send(user.email, E.welcomeEmail({ name }), { from: WELCOME_FROM });
  return { sent };
}

// ── API access form ──
export async function apiAccess(deps: FormDeps, body: any, meta: { ip?: string | null; country?: string | null; page?: string | null }) {
  if (!body || typeof body !== "object") throw new FormError(400, "Bad request");
  if (clean(body.website, 100)) return { sent: true };                      // the hidden field
  const v = { name: clean(body.name, LIMITS.name), email: clean(body.email, LIMITS.email).toLowerCase(),
    organization: clean(body.organization, LIMITS.field), interest: clean(body.segment ?? body.interest, 20) };
  if (!v.name) throw new FormError(422, "Please add your name.");
  if (!EMAIL.test(v.email)) throw new FormError(422, "Please add a valid email address.");
  if (!INTERESTS.includes(v.interest)) v.interest = "";
  const g = await guard(deps, "contactMessages", v.email, meta.ip);
  const at = deps.now().toISOString();
  const message = `API access request.\nInterested in: ${E.interestName(v.interest)}${v.organization ? `\nOrganisation: ${v.organization}` : ""}`;
  const id = await deps.add("contactMessages", { kind: "api-access", name: v.name, email: v.email, company: v.organization,
    topic: "API access", interest: v.interest || null, message, at, status: "new", ...g, country: meta.country || null,
    page: clean(meta.page, 200) || null });
  const [emailed] = await Promise.all([
    deps.send(v.email, E.apiAccessReceived({ name: v.name, interest: v.interest, organization: v.organization })),
    deps.send(deps.team, E.teamNotice({ subject: `API access request: ${v.name}${v.organization ? ` (${v.organization})` : ""}`,
      heading: "New API access request", rows: [["Name", v.name], ["Email", v.email], ["Organisation", v.organization],
        ["Interested in", E.interestName(v.interest)], ["Country", meta.country || ""]],
      link: ["Open in the console", "https://master.cricsynthesis.in/#messages"] }), { replyTo: v.email }),
  ]);
  return { sent: true, id, emailed };
}

// ── upgrade requests (the dashboard writes users/{uid}/requests/{plan}, then calls this) ──
export async function upgradeRequested(deps: FormDeps, user: { uid: string; email: string | null }, name: string | null, plan: string) {
  if (!UPGRADES.includes(plan) || !user.email) throw new FormError(422, "Bad plan");
  const path = `users/${user.uid}/requests/${plan}`;
  const r = await deps.get(path);
  const created = Date.parse(String(r?.created ?? ""));
  if (!r || r.status !== "pending" || r.mailed === true || !(deps.now().getTime() - created < 15 * 60_000)) return { sent: false };
  await deps.set(path, { mailed: true });
  const volume = clean(r.volume, 60), note = clean(r.note, 500);
  const prof = await deps.get(`users/${user.uid}`);              // the acknowledgement follows "Plan reminders"
  const [sent] = await Promise.all([
    prof?.notifyBilling === false ? Promise.resolve(false) : deps.send(user.email, E.upgradeRequested({ name, plan, volume })),
    deps.send(deps.team, E.teamNotice({ subject: `Upgrade request: ${E.planName(plan)} from ${name || user.email}`,
      heading: `New ${E.planName(plan)} request`, rows: [["Name", name || ""], ["Email", user.email], ["Plan", E.planName(plan)],
        ["Expected volume", volume], ["Account", user.uid]], body: note || undefined,
      link: ["Approve or decline in the console", "https://master.cricsynthesis.in/#requests"] }), { replyTo: user.email }),
  ]);
  return { sent };
}

// ── job applications ──
const APPLY_FIELDS: [string, number][] = [["phone", 20], ["city", 80], ["gender", 30], ["experience", 40], ["employer", LIMITS.field],
  ["designation", LIMITS.field], ["notice", 30], ["qualification", 60], ["tools", 400], ["heard", 60]];

export function parseApplication(body: any) {
  if (!body || typeof body !== "object") throw new FormError(400, "Bad request");
  if (clean(body.website, 100)) return null;
  const v: Record<string, string> = { job: clean(body.job, 80), jobTitle: clean(body.jobTitle, 120), name: clean(body.name, LIMITS.name),
    email: clean(body.email, LIMITS.email).toLowerCase(), portfolio: clean(body.portfolio, LIMITS.url),
    linkedin: clean(body.linkedin, LIMITS.url), notes: clean(body.notes, LIMITS.notes) };
  for (const [k, max] of APPLY_FIELDS) v[k] = clean(body[k], max);
  if (!/^[a-z0-9-]{2,80}$/.test(v.job) || !v.jobTitle) throw new FormError(422, "Bad job");
  if (!v.name || !v.phone || !v.city || !v.experience || !v.notice || !v.qualification) throw new FormError(422, "Please complete all required fields.");
  if (!EMAIL.test(v.email)) throw new FormError(422, "Please enter a valid email address.");
  if (!URL_RE.test(v.portfolio)) throw new FormError(422, "Please enter a valid portfolio link.");
  if (v.linkedin && !URL_RE.test(v.linkedin)) throw new FormError(422, "Please enter a valid LinkedIn link, or leave it blank.");
  const r = body.resume || {};
  const type = String(r.type || ""), data = String(r.data || "");
  if (!RESUME_TYPES[type]) throw new FormError(422, "Your resume must be a PDF or Word document.");
  // checked by its first bytes (PDF, Word 97 or a .docx zip) rather than scanning megabytes, to stay inside the CPU budget
  if (!MAGIC.some((m) => data.startsWith(m))) throw new FormError(422, "We could not read your resume. Please try another file.");
  const bytes = Math.floor(data.length * 3 / 4) - (data.endsWith("==") ? 2 : data.endsWith("=") ? 1 : 0);
  if (bytes > LIMITS.resumeBytes) throw new FormError(413, "Your resume must be under 5 MB.");
  const fname = clean(r.name, 120).replace(/[\\/:*?"<>|]+/g, "_") || `resume.${RESUME_TYPES[type]}`;
  return { v, resume: { name: fname, type, data, bytes } };
}

export async function apply(deps: FormDeps, body: any, meta: { ip?: string | null; country?: string | null }) {
  const p = parseApplication(body);
  if (!p) return { sent: true };
  const { v, resume } = p;
  const g = await guard(deps, "applications", v.email, meta.ip);
  const at = deps.now().toISOString();
  const chunks = Math.ceil(resume.data.length / LIMITS.chunk);
  const id = await deps.add("applications", { ...v, at, status: "new", ...g, country: meta.country || null,
    resume: { name: resume.name, type: resume.type, bytes: resume.bytes, chunks }, stored: false });
  for (let n = 0; n < chunks; n++) {
    await deps.set(`applications/${id}/resume/${n}`, { n, data: resume.data.slice(n * LIMITS.chunk, (n + 1) * LIMITS.chunk) });
  }
  await deps.set(`applications/${id}`, { stored: true });
  const [emailed] = await Promise.all([
    deps.send(v.email, E.applicationReceived({ name: v.name, jobTitle: v.jobTitle }), { from: CAREERS_FROM }),
    deps.send(deps.team, E.teamNotice({ subject: `Application: ${v.jobTitle} from ${v.name}`, heading: `New application: ${v.jobTitle}`,
      rows: [["Name", v.name], ["Email", v.email], ["Mobile", v.phone], ["City", v.city], ["Gender", v.gender], ["Experience", v.experience],
        ["Notice period", v.notice], ["Employer", v.employer], ["Designation", v.designation], ["Qualification", v.qualification],
        ["Portfolio", v.portfolio], ["LinkedIn", v.linkedin], ["Tools", v.tools], ["Heard via", v.heard]],
      body: v.notes || undefined, link: ["Review in the console", "https://master.cricsynthesis.in/#applications"] }),
      { replyTo: v.email, attachments: [{ filename: resume.name, content: resume.data }] }),
  ]);
  return { sent: true, id, emailed };
}
