"use client";
// Firebase Auth for the site. The web config is public by design (it identifies the project; access is
// enforced by Auth and the Firestore rules), so it lives in the code rather than in secrets.
import { getApps, initializeApp } from "firebase/app";
import { getAuth, onAuthStateChanged, type Auth, type User } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import { useEffect, useState } from "react";

const CONFIG = {
  apiKey: "AIzaSyCS3d9wd0kfNrQ5vZqXx1agjTqwCHKtLcU",
  authDomain: "cricsynthesis.firebaseapp.com",
  projectId: "cricsynthesis",
  storageBucket: "cricsynthesis.firebasestorage.app",
  messagingSenderId: "738796128383",
  appId: "1:738796128383:web:805a11670433963e73d74a",
};

function app() {
  return getApps()[0] ?? initializeApp(CONFIG);
}

export function auth(): Auth {
  return getAuth(app());
}

export function db(): Firestore {
  return getFirestore(app());
}

/** The signed-in user; undefined while Firebase is still checking. */
export function useUser(): User | null | undefined {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  useEffect(() => onAuthStateChanged(auth(), setUser), []);
  return user;
}

// ── plans ──────────────────────────────────────────────────────────────────────────────────────────────────────
// Guest: not signed in (forecasts and match centre). Free: signed in. Pro: MatchSynth Lab.
// A paid plan is a custom claim `plan` on the account ("free" | "pro"), set from server code once payments exist.
// Until then BETA_PRO gives every signed-in account Pro.
export type Plan = "guest" | "free" | "pro";
export const BETA_PRO = true;

export type PlanState = { user: User | null | undefined; plan: Plan | undefined; source: "beta" | "subscription" | null };

export function usePlan(): PlanState {
  const user = useUser();
  const [claim, setClaim] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    if (!user) { setClaim(user === null ? null : undefined); return; }
    let live = true;
    user.getIdTokenResult().then((r) => { if (live) setClaim(typeof r.claims.plan === "string" ? r.claims.plan : null); })
      .catch(() => { if (live) setClaim(null); });
    return () => { live = false; };
  }, [user]);
  if (user === undefined || (user && claim === undefined)) return { user, plan: undefined, source: null };
  if (!user) return { user, plan: "guest", source: null };
  if (claim === "pro") return { user, plan: "pro", source: "subscription" };
  if (BETA_PRO) return { user, plan: "pro", source: "beta" };
  return { user, plan: "free", source: claim ? "subscription" : null };
}

/** Pro (true / false), or undefined while the account is still being checked. */
export function usePro(): boolean | undefined {
  const { plan } = usePlan();
  return plan === undefined ? undefined : plan === "pro";
}
