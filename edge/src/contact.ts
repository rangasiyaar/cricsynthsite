// The website's contact form (POST /contact): checks the message, stores it in Firestore contactMessages/{auto id}
// for the admin console's Messages page, and sends the sender a "thanks, we'll get back to you" email.
// Spam guards: a hidden field bots fill in, a minimum time on the page, and at most 3 messages a day per email
// address and 10 per network (counted on contactMessages itself, so nothing else is stored).
import * as E from "./emails.ts";

export const TOPICS = ["General question", "API and Business plans", "CricSynthesis Pro", "Partnerships", "Press", "Something else"];
export const LIMITS = { name: 80, email: 254, company: 100, message: 4000, minMessage: 10, perEmailDay: 3, perIpDay: 10, minMs: 3000 };
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,189}\.[^\s@]{2,}$/;

export class ContactError extends Error { status: number; constructor(status: number, m: string) { super(m); this.status = status; } }

export type ContactInput = { name: string; email: string; topic: string; company: string; message: string };
export type ContactDeps = {
  add: (fields: Record<string, unknown>) => Promise<string>;
  count: (field: string, value: string) => Promise<number>;
  mail: (to: { email: string; name: string }, build: (name: string | null) => E.Email) => Promise<boolean>;
  sha256: (s: string) => Promise<string>;
  now: () => Date;
};

const clean = (v: unknown, max: number) => String(v ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim().slice(0, max);

/** Checks the form; returns null for a bot (the caller answers "sent" all the same, so bots learn nothing). */
export function parse(body: any): ContactInput | null {
  if (!body || typeof body !== "object") throw new ContactError(400, "Bad request");
  if (String(body.website ?? "").trim()) return null;                         // the hidden field
  if (Number(body.elapsed) > 0 && Number(body.elapsed) < LIMITS.minMs) return null;  // filled in faster than a person can
  const v: ContactInput = { name: clean(body.name, LIMITS.name), email: clean(body.email, LIMITS.email).toLowerCase(),
    topic: clean(body.topic, 60), company: clean(body.company, LIMITS.company), message: clean(body.message, LIMITS.message + 1) };
  if (!v.name) throw new ContactError(422, "Please add your name.");
  if (!EMAIL.test(v.email)) throw new ContactError(422, "Please add a valid email address.");
  if (!TOPICS.includes(v.topic)) v.topic = "General question";
  if (v.message.length < LIMITS.minMessage) throw new ContactError(422, "Please write a little more in your message.");
  if (v.message.length > LIMITS.message) throw new ContactError(422, `Please keep your message under ${LIMITS.message.toLocaleString("en-IN")} characters.`);
  return v;
}

export async function submit(deps: ContactDeps, body: any, meta: { ip?: string | null; country?: string | null; uid?: string | null; page?: string | null }) {
  const v = parse(body);
  if (!v) return { sent: true };
  const now = deps.now(), today = now.toISOString().slice(0, 10);
  const emailDay = `${(await deps.sha256(v.email)).slice(0, 24)}:${today}`;
  const ipDay = meta.ip ? `${(await deps.sha256(`ip:${meta.ip}`)).slice(0, 24)}:${today}` : "";
  const [byEmail, byIp] = await Promise.all([deps.count("emailDay", emailDay), ipDay ? deps.count("ipDay", ipDay) : Promise.resolve(0)]);
  if (byEmail >= LIMITS.perEmailDay || byIp >= LIMITS.perIpDay) {
    throw new ContactError(429, "We've received several messages from you today. We'll reply to those first, or email hello@cricsynthesis.in.");
  }
  const id = await deps.add({ ...v, at: now.toISOString(), status: "new", emailDay, ...(ipDay ? { ipDay } : {}),
    country: meta.country || null, uid: meta.uid || null, page: clean(meta.page, 200) || null });
  const emailed = await deps.mail({ email: v.email, name: v.name }, (name) => E.contactReceived({ name, topic: v.topic, message: v.message, at: now }))
    .catch(() => false);
  return { sent: true, id, emailed };
}
