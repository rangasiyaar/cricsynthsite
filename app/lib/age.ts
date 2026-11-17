"use client";
// Accounts are for people aged 18 and over. After any sign-in (website, app, MCP connect) we ask for the date of
// birth once and keep only the fact that the account holder confirmed they are 18+ (users/{uid}.adult, with the
// time): the date itself is never stored or sent. Under 18: the new sign-in is deleted straight away and nothing is
// kept about them; this device then refuses new sign-ins until their 18th birthday (stored only on the device).
import { deleteUser, signOut, type User } from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, db } from "./firebase";

export { ageOn, MIN_AGE, validDob } from "./ageRules";
import { MIN_AGE } from "./ageRules";
const BLOCK = "cs-age-block";

/** The date this device may sign up again (an under-18 answer), or null. */
export function blockedUntil(): Date | null {
  try {
    const v = localStorage.getItem(BLOCK);
    if (!v) return null;
    const d = new Date(v);
    if (Number.isNaN(d.getTime()) || d <= new Date()) { localStorage.removeItem(BLOCK); return null; }
    return d;
  } catch { return null; }
}

export async function isAdult(uid: string): Promise<boolean> {
  const s = await getDoc(doc(db(), "users", uid));
  return s.exists() && s.data().adult === true;
}

export async function confirmAdult(uid: string): Promise<void> {
  await setDoc(doc(db(), "users", uid), { adult: true, ageConfirmed: serverTimestamp() }, { merge: true });
}

/** Under 18: delete the sign-in we just created (or at least sign out) and block this device until they turn 18. */
export async function declineMinor(user: User, dob: { y: number; m: number; d: number }): Promise<void> {
  try { localStorage.setItem(BLOCK, new Date(dob.y + MIN_AGE, dob.m - 1, dob.d).toISOString()); } catch {}
  try { await deleteUser(user); } catch { /* an older sign-in needs a fresh login to delete: sign out instead */ }
  await signOut(auth()).catch(() => {});
}
