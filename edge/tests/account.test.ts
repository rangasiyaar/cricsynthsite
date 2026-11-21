// Account deletion (POST /account/delete): every document under users/{uid}, in a few requests, then the profile.
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { test } from "node:test";
import { Firestore } from "../src/google.ts";

const pem = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const SA = JSON.stringify({ client_email: "sa@p.iam.gserviceaccount.com", private_key: pem, project_id: "p" });
const ROOT = "projects/p/databases/(default)/documents";

test("deleteAccountData: lists each subcollection and deletes it all with the profile", async () => {
  const calls: { url: string; body: any }[] = [];
  const docs: Record<string, string[]> = { keys: ["k1", "k2"], usage: Array.from({ length: 450 }, (_, i) => `d${i}`), billing: ["pro"] };
  const real = globalThis.fetch;
  globalThis.fetch = (async (input: any, init: any) => {
    const url = String(input), body = init?.body && !url.includes("oauth2") ? JSON.parse(init.body) : null;
    calls.push({ url, body });
    if (url.includes("oauth2.googleapis.com")) return Response.json({ access_token: "t", expires_in: 3600 });
    if (url.endsWith(":listCollectionIds")) return Response.json({ collectionIds: Object.keys(docs) });
    if (url.endsWith(":runQuery")) {
      const c = body.structuredQuery.from[0].collectionId;
      return Response.json([...docs[c].map((id) => ({ document: { name: `${ROOT}/users/u1/${c}/${id}` } })), { readTime: "x" }]);
    }
    if (url.endsWith(":commit")) return Response.json({});
    return new Response("?", { status: 404 });
  }) as typeof fetch;
  try {
    const n = await new Firestore(SA).deleteAccountData("u1");
    assert.equal(n, 2 + 450 + 1 + 1);
    const commits = calls.filter((c) => c.url.endsWith(":commit"));
    assert.equal(commits.length, 2);                                 // 400 writes per commit
    const deleted = commits.flatMap((c) => c.body.writes.map((w: any) => w.delete));
    assert.ok(deleted.includes(`${ROOT}/users/u1`));
    assert.ok(deleted.includes(`${ROOT}/users/u1/billing/pro`));
    assert.ok(deleted.every((d: string) => d.startsWith(`${ROOT}/users/u1`)));
    assert.ok(calls.length <= 8, `${calls.length} requests`);
  } finally { globalThis.fetch = real; }
});
