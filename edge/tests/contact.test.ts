// The contact form (POST /contact): checks, spam guards, daily limits, storage and the acknowledgement email.
import assert from "node:assert/strict";
import { test } from "node:test";
import * as C from "../src/contact.ts";
import { sha256 } from "../src/keys.ts";

function world() {
  const docs: Record<string, unknown>[] = [], mails: { to: string; subject: string; text: string }[] = [];
  const deps: C.ContactDeps = {
    add: async (f) => { docs.push(f); return `m${docs.length}`; },
    count: async (field, value) => docs.filter((d) => d[field] === value).length,
    mail: async (to, build) => { const m = build(to.name); mails.push({ to: to.email, subject: m.subject, text: m.text }); return true; },
    sha256, now: () => new Date("2026-11-21T10:00:00Z"),
  };
  return { deps, docs, mails };
}
const good = { name: "Asha Rao", email: "Asha@Example.com", topic: "API and Business plans", company: "Example Media",
               message: "We'd like forecasts for every domestic T20 on our site.", elapsed: 12000 };

test("a message is stored for the console and acknowledged by email", async () => {
  const w = world();
  const r = await C.submit(w.deps, good, { ip: "203.0.113.9", country: "IN", page: "https://cricsynthesis.in/contact/" });
  assert.deepEqual([r.sent, r.id, r.emailed], [true, "m1", true]);
  const d = w.docs[0];
  assert.equal(d.email, "asha@example.com");
  assert.equal(d.status, "new");
  assert.equal(d.topic, "API and Business plans");
  assert.equal(d.country, "IN");
  assert.ok(!JSON.stringify(d).includes("203.0.113.9"));                    // the network is stored only as a hash
  assert.equal(w.mails[0].to, "asha@example.com");
  assert.match(w.mails[0].subject, /Thanks for contacting/);
  assert.match(w.mails[0].text, /Hi Asha/);
  assert.match(w.mails[0].text, /every domestic T20/);
});

test("bots get a quiet 'sent' and nothing is stored", async () => {
  const w = world();
  assert.deepEqual(await C.submit(w.deps, { ...good, website: "http://spam" }, {}), { sent: true });
  assert.deepEqual(await C.submit(w.deps, { ...good, elapsed: 800 }, {}), { sent: true });
  assert.equal(w.docs.length, 0);
  assert.equal(w.mails.length, 0);
});

test("bad input is refused with a plain message", async () => {
  const w = world();
  await assert.rejects(C.submit(w.deps, { ...good, name: " " }, {}), /your name/);
  await assert.rejects(C.submit(w.deps, { ...good, email: "nope" }, {}), /valid email/);
  await assert.rejects(C.submit(w.deps, { ...good, message: "hi" }, {}), /a little more/);
  await assert.rejects(C.submit(w.deps, { ...good, message: "x".repeat(4001) }, {}), /under 4,000/);
  const r = await C.submit(w.deps, { ...good, topic: "<script>" }, {});
  assert.equal(r.sent, true);
  assert.equal(w.docs[0].topic, "General question");                        // unknown topics fall back
});

test("at most 3 a day per email address and 10 per network", async () => {
  const w = world();
  for (let i = 0; i < 3; i++) await C.submit(w.deps, good, { ip: "198.51.100.1" });
  await assert.rejects(C.submit(w.deps, good, { ip: "198.51.100.2" }), (e: any) => e.status === 429);
  for (let i = 0; i < 7; i++) await C.submit(w.deps, { ...good, email: `p${i}@example.com` }, { ip: "198.51.100.1" });
  await assert.rejects(C.submit(w.deps, { ...good, email: "new@example.com" }, { ip: "198.51.100.1" }), (e: any) => e.status === 429);
});
