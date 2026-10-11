// API keys, usage, upgrade requests and profile, stored in Firestore under the signed-in user (see infra/firestore.rules).
// A key is generated in this browser, shown once, and only its SHA-256 hash and a short prefix are saved;
// the API looks keys up by hash. New keys are on the free API plan; higher limits are set by us.
import {
  collection, deleteDoc, doc, documentId, getDoc, getDocs, query, serverTimestamp, setDoc, updateDoc, where, type Timestamp,
} from "firebase/firestore";
import { db } from "./firebase";

export const SLOTS = ["k1", "k2", "k3", "k4", "k5"] as const;
export const API_PLANS: Record<string, { daily: number; sims: number; label: string }> = {
  free: { daily: 200, sims: 2_000, label: "Free" },
  pro: { daily: 5_000, sims: 20_000, label: "Pro" },
  business: { daily: 50_000, sims: 50_000, label: "Business" },
};

export type ApiKey = {
  slot: string; name: string; prefix: string; plan: string; created: Date | null; revoked: boolean; lastUsed: Date | null;
};
export type Notify = { notifyProduct?: boolean; notifyUsage?: boolean; notifyBilling?: boolean };
export type Profile = { company?: string; useCase?: string } & Notify;
/** One day of API requests (UTC day), written by the API about once a minute. */
export type UsageDay = { day: string; total: number; keys: Record<string, number>; cats: Record<string, number> };
export const CATEGORIES: [string, string][] = [["analytics", "Analytics"], ["simulation", "Simulation & modelling"], ["graphics", "Graphics"]];
export const UPGRADES = ["api-pro", "api-business"] as const;
export type Upgrade = (typeof UPGRADES)[number];
export const VOLUMES: [string, string][] = [["<1k", "Under 1,000 a day"], ["1k-10k", "1,000–10,000 a day"],
  ["10k-50k", "10,000–50,000 a day"], [">50k", "More than 50,000 a day"]];
export type UpgradeRequest = { plan: Upgrade; volume: string; note: string; status: "pending" | "approved" | "declined" | "cancelled"; created: Date | null };
const toDate = (t: unknown) => (t ? (t as Timestamp).toDate() : null);

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

export function newKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return "cs_live_" + Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

export async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function listKeys(uid: string): Promise<ApiKey[]> {
  const snap = await getDocs(collection(db(), "users", uid, "keys"));
  return snap.docs.map((d) => {
    const v = d.data();
    return { slot: d.id, name: v.name, prefix: v.prefix, plan: v.plan, revoked: !!v.revoked,
             created: toDate(v.created), lastUsed: toDate(v.lastUsed) };
  }).sort((a, b) => (b.created?.getTime() ?? 0) - (a.created?.getTime() ?? 0));
}

/** Creates a key in the first free slot and returns the full key (shown once). */
export async function createKey(uid: string, name: string, used: string[]): Promise<string> {
  const slot = SLOTS.find((s) => !used.includes(s));
  if (!slot) throw new Error("You can have up to five keys. Revoke and delete one to make room.");
  const key = newKey();
  await setDoc(doc(db(), "users", uid, "keys", slot), {
    name: name.trim().slice(0, 40) || "Untitled key", prefix: key.slice(0, 12), hash: await sha256(key),
    plan: "free", created: serverTimestamp(), revoked: false,
  });
  return key;
}

export const renameKey = (uid: string, slot: string, name: string) =>
  updateDoc(doc(db(), "users", uid, "keys", slot), { name: name.trim().slice(0, 40) || "Untitled key" });
export const revokeKey = (uid: string, slot: string) =>
  updateDoc(doc(db(), "users", uid, "keys", slot), { revoked: true, revokedAt: serverTimestamp() });
export const deleteKey = (uid: string, slot: string) => deleteDoc(doc(db(), "users", uid, "keys", slot));

export async function getProfile(uid: string): Promise<Profile> {
  const s = await getDoc(doc(db(), "users", uid));
  return (s.exists() ? s.data() : {}) as Profile;
}

export const saveProfile = (uid: string, p: Profile) =>
  setDoc(doc(db(), "users", uid), { company: (p.company ?? "").slice(0, 80), useCase: (p.useCase ?? "").slice(0, 280),
                                    updated: serverTimestamp() }, { merge: true });

export const saveNotify = (uid: string, n: Notify) =>
  setDoc(doc(db(), "users", uid), { ...n, updated: serverTimestamp() }, { merge: true });

/** UTC day key, matching the API's daily counter (limits reset at 00:00 UTC). */
export const dayKey = (d: Date) => d.toISOString().slice(0, 10);

/** The last `days` days of usage, oldest first, with empty days filled in. */
export async function listUsage(uid: string, days: number): Promise<UsageDay[]> {
  const start = new Date(Date.now() - (days - 1) * 864e5);
  const snap = await getDocs(query(collection(db(), "users", uid, "usage"), where(documentId(), ">=", dayKey(start))));
  const got = new Map(snap.docs.map((d) => [d.id, d.data()]));
  return Array.from({ length: days }, (_, i) => {
    const day = dayKey(new Date(start.getTime() + i * 864e5));
    const v = got.get(day) ?? {};
    return { day, total: v.total ?? 0, keys: v.keys ?? {}, cats: v.cats ?? {} };
  });
}

export async function listRequests(uid: string): Promise<UpgradeRequest[]> {
  const snap = await getDocs(collection(db(), "users", uid, "requests"));
  return snap.docs.map((d) => {
    const v = d.data();
    return { plan: d.id as Upgrade, volume: v.volume, note: v.note ?? "", status: v.status, created: toDate(v.created) };
  });
}

/** Files (or re-files) a request; our team reviews it and confirms pricing by email before anything changes. */
export const requestUpgrade = (uid: string, plan: Upgrade, volume: string, note: string) =>
  setDoc(doc(db(), "users", uid, "requests", plan), {
    plan, volume, note: note.trim().slice(0, 500), status: "pending", created: serverTimestamp(),
  });

export const cancelRequest = (uid: string, plan: Upgrade) =>
  updateDoc(doc(db(), "users", uid, "requests", plan), { status: "cancelled" });
