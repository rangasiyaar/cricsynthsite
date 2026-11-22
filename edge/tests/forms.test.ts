// The forms that used to go to the sign-ups Apps Script (forms.ts): welcome, API access, upgrade requests, job applications.
import assert from "node:assert/strict";
import { test } from "node:test";
import * as F from "../src/forms.ts";
import { sha256 } from "../src/keys.ts";

const NOW = new Date("2026-11-22T10:00:00Z");
function world(seed: Record<string, Record<string, unknown>> = {}) {
  const docs: Record<string, Record<string, unknown>> = { ...seed };
  const mails: { to: string; subject: string; text: string; from?: string; replyTo?: string; files: number }[] = [];
  let n = 0;
  const deps: F.FormDeps = {
    add: async (c, f) => { const id = `d${++n}`; docs[`${c}/${id}`] = { ...f }; return id; },
    set: async (p, f) => { docs[p] = { ...(docs[p] || {}), ...f }; },
    get: async (p) => docs[p] || null,
    count: async (c, field, value) => Object.entries(docs).filter(([k, d]) => k.split("/").length === 2 && k.startsWith(`${c}/`) && d[field] === value).length,
    send: async (to, m, o) => { mails.push({ to, subject: m.subject, text: m.text, from: o?.from, replyTo: o?.replyTo, files: o?.attachments?.length || 0 }); return true; },
    sha256, now: () => NOW, team: "team@example.com",
  };
  return { deps, docs, mails };
}

test("welcome: once, only after the 18+ confirmation, from welcome@", async () => {
  const w = world({ "users/u1": { adult: true }, "users/u2": {} });
  assert.deepEqual(await F.welcome(w.deps, { uid: "u2", email: "b@example.com" }, "Bo", "web"), { sent: false });
  assert.deepEqual(await F.welcome(w.deps, { uid: "u1", email: "a@example.com" }, "Asha Rao", "app"), { sent: true });
  assert.deepEqual(await F.welcome(w.deps, { uid: "u1", email: "a@example.com" }, "Asha Rao", "app"), { sent: false });
  assert.equal(w.mails.length, 1);
  assert.match(w.mails[0].from!, /welcome@/);
  assert.match(w.mails[0].text, /Hi Asha/);
  assert.equal(w.docs["users/u1"].signupSource, "app");
});

test("API access: stored for the Messages page, acknowledged, team told with reply-to", async () => {
  const w = world();
  const r = await F.apiAccess(w.deps, { name: "Asha", email: "Asha@Example.com", organization: "Example Media", segment: "graphics" }, { ip: "203.0.113.9", country: "IN" });
  assert.equal(r.sent, true);
  const d = w.docs["contactMessages/d1"];
  assert.equal(d.kind, "api-access");
  assert.equal(d.status, "new");
  assert.match(String(d.message), /Graphics/);
  assert.ok(!JSON.stringify(d).includes("203.0.113.9"));
  assert.deepEqual(w.mails.map((m) => m.to), ["asha@example.com", "team@example.com"]);
  assert.equal(w.mails[1].replyTo, "asha@example.com");
  await assert.rejects(F.apiAccess(w.deps, { name: "", email: "x@y.in" }, {}), /name/);
  assert.deepEqual(await F.apiAccess(w.deps, { name: "Bot", email: "b@x.in", website: "spam" }, {}), { sent: true });
  for (let i = 0; i < 2; i++) await F.apiAccess(w.deps, { name: "Asha", email: "asha@example.com" }, {});
  await assert.rejects(F.apiAccess(w.deps, { name: "Asha", email: "asha@example.com" }, {}), (e: any) => e.status === 429);
});

test("upgrade request: only a fresh pending one, mailed once", async () => {
  const fresh = new Date(NOW.getTime() - 60_000).toISOString();
  const w = world({ "users/u1/requests/api-pro": { status: "pending", created: fresh, volume: "1k–10k a day", note: "Live site" },
                    "users/u1/requests/api-business": { status: "pending", created: "2026-11-01T00:00:00Z" } });
  const u = { uid: "u1", email: "a@example.com" };
  assert.deepEqual(await F.upgradeRequested(w.deps, u, "Asha", "api-pro"), { sent: true });
  assert.deepEqual(await F.upgradeRequested(w.deps, u, "Asha", "api-pro"), { sent: false });
  assert.deepEqual(await F.upgradeRequested(w.deps, u, "Asha", "api-business"), { sent: false });
  await assert.rejects(F.upgradeRequested(w.deps, u, "Asha", "free"), /plan/);
  assert.equal(w.mails.length, 2);
  assert.match(w.mails[0].subject, /API Plus/);
  assert.match(w.mails[1].text, /Live site/);
});

const pdf = Buffer.from("%PDF-1.4 " + "x".repeat(2_000_000)).toString("base64");
const app = { job: "graphics-designer", jobTitle: "Graphics Designer & Video Editor", name: "Ravi K", email: "ravi@example.com",
  phone: "+91 98765 43210", city: "Pune", experience: "2–4 years", notice: "30 days", qualification: "Bachelor's degree",
  portfolio: "https://behance.net/ravi", resume: { name: "Ravi CV.pdf", type: "application/pdf", data: pdf } };

test("application: stored with the resume in chunks, applicant and team emailed, resume attached", async () => {
  const w = world();
  const r = await F.apply(w.deps, app, { ip: "1.2.3.4" });
  assert.equal(r.sent, true);
  const d = w.docs["applications/d1"];
  assert.equal(d.status, "new");
  assert.equal(d.stored, true);
  const chunks = (d.resume as any).chunks;
  assert.ok(chunks >= 3);
  assert.equal(Array.from({ length: chunks }, (_, i) => w.docs[`applications/d1/resume/${i}`].data).join(""), pdf);
  assert.deepEqual(w.mails.map((m) => [m.to, m.files]), [["ravi@example.com", 0], ["team@example.com", 1]]);
  assert.match(w.mails[0].from!, /careers@/);
});

test("application: checks the fields and the file", async () => {
  const w = world();
  await assert.rejects(F.apply(w.deps, { ...app, portfolio: "behance" }, {}), /portfolio/);
  await assert.rejects(F.apply(w.deps, { ...app, resume: { ...app.resume, type: "image/png" } }, {}), /PDF or Word/);
  await assert.rejects(F.apply(w.deps, { ...app, resume: { ...app.resume, data: Buffer.from("hello").toString("base64") } }, {}), /could not read/);
  const big = Buffer.from("%PDF" + "x".repeat(6 * 1024 * 1024)).toString("base64");
  await assert.rejects(F.apply(w.deps, { ...app, resume: { ...app.resume, data: big } }, {}), (e: any) => e.status === 413);
  assert.deepEqual(await F.apply(w.deps, { ...app, website: "x" }, {}), { sent: true });
  assert.equal(Object.keys(w.docs).length, 0);
});
