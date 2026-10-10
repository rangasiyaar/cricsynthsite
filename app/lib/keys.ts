// API keys and profile, stored in Firestore under the signed-in user (see infra/firestore.rules).
// A key is generated in this browser, shown once, and only its SHA-256 hash and a short prefix are saved;
// the API looks keys up by hash. New keys are on the free API plan; higher limits are set by us.
import {
  collection, deleteDoc, doc, getDoc, getDocs, serverTimestamp, setDoc, updateDoc, type Timestamp,
} from "firebase/firestore";
import { db } from "./firebase";

export const SLOTS = ["k1", "k2", "k3", "k4", "k5"] as const;
export const API_PLANS: Record<string, { daily: number; sims: number; label: string }> = {
  free: { daily: 200, sims: 2_000, label: "Free" },
  pro: { daily: 5_000, sims: 20_000, label: "Pro" },
  business: { daily: 50_000, sims: 50_000, label: "Business" },
};

export type ApiKey = { slot: string; name: string; prefix: string; plan: string; created: Date | null; revoked: boolean };
export type Profile = { company?: string; useCase?: string };

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
             created: v.created ? (v.created as Timestamp).toDate() : null };
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
