// Account activity for the console (src/activity.ts): device parsing, city-level place, visits merged and trimmed.
import assert from "node:assert/strict";
import { test } from "node:test";
import * as A from "../src/activity.ts";

const T0 = Date.UTC(2026, 10, 26, 12);
const PHONE = "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36";
const APP = "Mozilla/5.0 (Linux; Android 13; Pixel 7 Build/TQ3A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/131.0 Mobile Safari/537.36";
const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0 Mobile/15E148 Safari/604.1";
const BLR = { city: "Bengaluru", region: "Karnataka", country: "IN", colo: "BLR", latitude: "12.9" };

function store() {
  const docs = new Map<string, Record<string, any>>();
  return { docs, get: async (p: string) => docs.get(p) ?? null, set: async (p: string, f: Record<string, unknown>) => { docs.set(p, { ...(docs.get(p) || {}), ...f }); } };
}

test("device, OS and browser from the User-Agent", () => {
  assert.deepEqual(A.agentOf(PHONE, "web"), { device: "android", os: "Android 14", browser: "Chrome" });
  assert.deepEqual(A.agentOf(APP, "app"), { device: "android", os: "Android 13", browser: "App" });
  assert.deepEqual(A.agentOf(MAC, "web"), { device: "desktop", os: "macOS", browser: "Safari" });
  assert.deepEqual(A.agentOf(IPHONE, "web"), { device: "ios", os: "iOS 17.5", browser: "Chrome" });
  assert.deepEqual(A.agentOf(null, "web"), { device: "unknown", os: null, browser: null });
});

test("place keeps city, region and country only", () => {
  assert.deepEqual(A.placeOf(BLR), { city: "Bengaluru", region: "Karnataka", country: "IN" });
  assert.deepEqual(A.placeOf(null), { city: null, region: null, country: null });
});

test("visits: merged within 30 minutes, split by where, trimmed to 3 days; last web and app kept", async () => {
  const s = store(), path = "users/u1/activity/recent";
  await A.seen(s, "u1", { where: "web" }, { ua: PHONE, cf: BLR, now: T0 });
  await A.seen(s, "u1", { where: "web" }, { ua: PHONE, cf: BLR, now: T0 + 10 * 60_000 });
  let d = s.docs.get(path)!;
  assert.equal(d.visits.length, 1);
  assert.equal(d.visits[0].pings, 2);
  assert.equal(JSON.stringify(d).includes("ip"), false);
  await A.seen(s, "u1", { where: "app", version: "0.3.32" }, { ua: APP, cf: { city: "Mumbai", region: "Maharashtra", country: "IN" }, now: T0 + 20 * 60_000 });
  d = s.docs.get(path)!;
  assert.equal(d.visits.length, 2);
  assert.equal(d.appVersion, "0.3.32");
  assert.equal(d.lastWeb, new Date(T0 + 10 * 60_000).toISOString());
  assert.equal(d.firstApp, new Date(T0 + 20 * 60_000).toISOString());
  assert.deepEqual(d.place, { city: "Mumbai", region: "Maharashtra", country: "IN" });
  // 4 days later: the old visits drop out, the last-seen fields stay
  await A.seen(s, "u1", { where: "web" }, { ua: MAC, cf: BLR, now: T0 + 4 * 86400_000 });
  d = s.docs.get(path)!;
  assert.equal(d.visits.length, 1);
  assert.equal(d.visits[0].os, "macOS");
  assert.equal(d.appVersion, "0.3.32");
  assert.equal(d.firstApp, new Date(T0 + 20 * 60_000).toISOString());
});
